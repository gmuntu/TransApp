#!/usr/bin/env python3
"""
================================================================================
STITCH & PAD LECTURE DUBBER — PYTHON 3.13 macOS PRODUCTION ENGINE
================================================================================
Platform: macOS (Apple Silicon M1 / M2 / M3, 16GB RAM)
Python Runtime: Python 3.13+
Architecture Rules:
1. pysrt for subtitle parsing
2. deep-translator (GoogleTranslator)
3. audioop-lts (PEP 594 patch for Python 3.13)
4. pydub for 44100Hz Stereo Master Silent Canvas
5. Native macOS 'say -v Thomas -r [rate]' for dynamic zero-truncation speedup
================================================================================
"""

import os
import sys
import math
import shutil
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Optional, Callable

# RULE 3: Python 3.13 audioop patch
try:
    import audioop
except ModuleNotFoundError:
    try:
        import audioop_lts as audioop
        sys.modules['audioop'] = audioop
    except ModuleNotFoundError:
        print("[ERROR] Please install audioop-lts: pip install audioop-lts")
        sys.exit(1)

try:
    import pysrt
    from pydub import AudioSegment
    from deep_translator import GoogleTranslator
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    print("[FIX] Run: pip install -r requirements.txt")
    sys.exit(1)

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

DEFAULT_BASE_WPM = 175
SAMPLE_RATE = 44100
CHANNELS = 2
SAFETY_MARGIN_MS = 60


class StitchAndPadEngine:
    def __init__(self, voice: str = "Thomas", base_wpm: int = DEFAULT_BASE_WPM):
        self.voice = voice
        self.base_wpm = base_wpm

    def translate_subtitles(
        self,
        input_srt: str,
        output_srt: str,
        progress_cb: Optional[Callable[[int, int, str], None]] = None
    ) -> str:
        subs = pysrt.open(input_srt, encoding='utf-8')
        total = len(subs)
        translator = GoogleTranslator(source='en', target='fr')

        for idx, sub in enumerate(subs):
            clean_text = sub.text.strip().replace('\n', ' ')
            if clean_text:
                try:
                    sub.text = translator.translate(clean_text)
                except Exception as e:
                    print(f"Row {idx+1} translation fallback: {e}")
            if progress_cb:
                progress_cb(idx + 1, total, sub.text)

        subs.save(output_srt, encoding='utf-8')
        return output_srt

    @staticmethod
    def _calculate_target_rate(text: str, allowed_duration_ms: int, base_wpm: int = DEFAULT_BASE_WPM) -> int:
        words = [w for w in text.replace("'", " ").split() if w]
        count = len(words)
        if count == 0 or allowed_duration_ms <= 0:
            return base_wpm

        usable_ms = max(400, allowed_duration_ms - SAFETY_MARGIN_MS)
        natural_ms = (count / base_wpm) * 60000.0

        if natural_ms <= usable_ms:
            return base_wpm

        needed_wpm = math.ceil((count / usable_ms) * 60000.0)
        return min(280, max(base_wpm, needed_wpm))

    def stitch_and_pad_audio(
        self,
        verified_srt: str,
        output_wav: str,
        progress_cb: Optional[Callable[[int, int, int, str], None]] = None
    ) -> str:
        subs = pysrt.open(verified_srt, encoding='utf-8')
        total = len(subs)
        if total == 0:
            raise ValueError("SRT file has 0 rows.")

        last = subs[-1]
        total_ms = (
            last.end.hours * 3600000
            + last.end.minutes * 60000
            + last.end.seconds * 1000
            + last.end.milliseconds
            + 3000
        )

        master_canvas = AudioSegment.silent(duration=total_ms, frame_rate=SAMPLE_RATE).set_channels(CHANNELS)
        temp_dir = tempfile.mkdtemp(prefix="stitch_pad_")

        try:
            for idx, sub in enumerate(subs):
                txt = sub.text.strip().replace('\n', ' ')
                if not txt:
                    continue

                start_ms = (
                    sub.start.hours * 3600000
                    + sub.start.minutes * 60000
                    + sub.start.seconds * 1000
                    + sub.start.milliseconds
                )
                end_ms = (
                    sub.end.hours * 3600000
                    + sub.end.minutes * 60000
                    + sub.end.seconds * 1000
                    + sub.end.milliseconds
                )
                allowed_ms = max(500, end_ms - start_ms)
                rate = self._calculate_target_rate(txt, allowed_ms, self.base_wpm)

                temp_aiff = os.path.join(temp_dir, f"row_{idx:05d}.aiff")
                cmd = ["say", "-v", self.voice, "-r", str(rate), txt, "-o", temp_aiff]
                subprocess.run(cmd, check=True)

                if os.path.exists(temp_aiff) and os.path.getsize(temp_aiff) > 0:
                    chunk = AudioSegment.from_file(temp_aiff, format="aiff")
                    chunk = chunk.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)
                    master_canvas = master_canvas.overlay(chunk, position=start_ms)
                    try:
                        os.remove(temp_aiff)
                    except OSError:
                        pass

                if progress_cb:
                    progress_cb(idx + 1, total, rate, txt)

            master_canvas.export(output_wav, format="wav")
            return output_wav
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


class StitchPadApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Stitch & Pad — macOS Lecture Dubber (Python 3.13 M1)")
        self.geometry("960x700")
        self.engine = StitchAndPadEngine()
        self.input_srt = tk.StringVar()
        self.corrected_srt = tk.StringVar()
        self.output_wav = tk.StringVar()
        self._build_ui()

    def _build_ui(self):
        notebook = ttk.Notebook(self)
        notebook.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        t1 = ttk.Frame(notebook, padding=12)
        notebook.add(t1, text="1. Translation & Text Review")
        
        f1 = ttk.Frame(t1)
        f1.pack(fill=tk.X, pady=4)
        ttk.Label(f1, text="Input English SRT:").pack(side=tk.LEFT)
        ttk.Entry(f1, textvariable=self.input_srt, width=45).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)
        ttk.Button(f1, text="Browse", command=self._browse_in).pack(side=tk.LEFT)

        ttk.Button(t1, text="▶ Run Translation Pipeline (EN -> FR)", command=self._start_trans).pack(anchor=tk.W, pady=8)
        self.lbl_t1 = ttk.Label(t1, text="Ready")
        self.lbl_t1.pack(anchor=tk.W)

        self.txt_rev = scrolledtext.ScrolledText(t1, height=14)
        self.txt_rev.pack(fill=tk.BOTH, expand=True, pady=6)
        ttk.Button(t1, text="💾 Save weekX_A_CORRIGER.srt", command=self._save_corr).pack(anchor=tk.E)

        t2 = ttk.Frame(notebook, padding=12)
        notebook.add(t2, text="2. Stitch & Pad Audio Engine")

        f2 = ttk.Frame(t2)
        f2.pack(fill=tk.X, pady=4)
        ttk.Label(f2, text="Verified French SRT:").pack(side=tk.LEFT)
        ttk.Entry(f2, textvariable=self.corrected_srt, width=45).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)
        ttk.Button(f2, text="Browse", command=self._browse_corr).pack(side=tk.LEFT)

        f3 = ttk.Frame(t2)
        f3.pack(fill=tk.X, pady=4)
        ttk.Label(f3, text="Output Master WAV:").pack(side=tk.LEFT)
        ttk.Entry(f3, textvariable=self.output_wav, width=45).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)
        ttk.Button(f3, text="Browse", command=self._browse_out).pack(side=tk.LEFT)

        ttk.Button(t2, text="🎙️ Generate Stitch & Pad Audio", command=self._start_stitch).pack(anchor=tk.W, pady=8)
        self.pbar = ttk.Progressbar(t2, orient="horizontal", mode="determinate")
        self.pbar.pack(fill=tk.X, pady=4)
        self.lbl_t2 = ttk.Label(t2, text="Waiting...")
        self.lbl_t2.pack(anchor=tk.W)

        self.txt_log = scrolledtext.ScrolledText(t2, height=10, bg="#020617", fg="#22c55e")
        self.txt_log.pack(fill=tk.BOTH, expand=True, pady=6)

    def _browse_in(self):
        fn = filedialog.askopenfilename(filetypes=[("SRT", "*.srt")])
        if fn:
            self.input_srt.set(fn)
            base = os.path.dirname(fn)
            stem = Path(fn).stem
            self.corrected_srt.set(os.path.join(base, f"{stem}_A_CORRIGER.srt"))
            self.output_wav.set(os.path.join(base, f"{stem}_doublage_final.wav"))

    def _browse_corr(self):
        fn = filedialog.askopenfilename(filetypes=[("SRT", "*.srt")])
        if fn: self.corrected_srt.set(fn)

    def _browse_out(self):
        fn = filedialog.asksaveasfilename(defaultextension=".wav")
        if fn: self.output_wav.set(fn)

    def _start_trans(self):
        inp = self.input_srt.get()
        out = self.corrected_srt.get()
        if not inp or not os.path.exists(inp):
            messagebox.showerror("Error", "Select valid input SRT.")
            return
        def run():
            self.lbl_t1.config(text="Translating...")
            try:
                self.engine.translate_subtitles(inp, out, lambda c, t, s: self.lbl_t1.config(text=f"Row {c}/{t}"))
                with open(out, 'r', encoding='utf-8') as f:
                    data = f.read()
                self.txt_rev.delete("1.0", tk.END)
                self.txt_rev.insert(tk.END, data)
                self.lbl_t1.config(text="Translation complete!")
                messagebox.showinfo("Done", f"Saved to {out}")
            except Exception as e:
                self.lbl_t1.config(text=f"Error: {e}")
        threading.Thread(target=run, daemon=True).start()

    def _save_corr(self):
        out = self.corrected_srt.get()
        with open(out, 'w', encoding='utf-8') as f:
            f.write(self.txt_rev.get("1.0", tk.END))
        messagebox.showinfo("Saved", f"Saved to {out}")

    def _start_stitch(self):
        sin = self.corrected_srt.get()
        wout = self.output_wav.get()
        if not sin or not os.path.exists(sin):
            messagebox.showerror("Error", "Select valid French SRT.")
            return
        def run():
            try:
                def cb(c, t, r, txt):
                    pct = (c / t) * 100.0
                    self.pbar["value"] = pct
                    self.lbl_t2.config(text=f"Row {c}/{t} ({pct:.1f}%) [Rate: {r} wpm]")
                    self.txt_log.insert(tk.END, f"[{c:04d}] {r} WPM -> {txt[:40]}...\n")
                    self.txt_log.see(tk.END)
                self.engine.stitch_and_pad_audio(sin, wout, cb)
                self.lbl_t2.config(text="✅ Audio generated successfully! 0ms drift.")
                messagebox.showinfo("Success", f"Exported: {wout}\\nReady for Filmora 00:00:00:00.")
            except Exception as e:
                self.lbl_t2.config(text=f"Error: {e}")
        threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    app = StitchPadApp()
    app.mainloop()
