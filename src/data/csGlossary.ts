import { CSGlossaryTerm } from '../types';

export const CS_GLOSSARY: CSGlossaryTerm[] = [
  // Concurrency & Threading
  { en: 'thread-safe', fr: 'sûr au niveau des threads (thread-safe)', category: 'concurrency', notes: 'Often kept as thread-safe in professional CS lectures' },
  { en: 'deadlock', fr: 'interblocage (deadlock)', category: 'concurrency', notes: 'Mutual lock where two threads wait forever' },
  { en: 'livelock', fr: 'verrouillage actif (livelock)', category: 'concurrency', notes: 'Threads keep changing state without advancing' },
  { en: 'race condition', fr: 'condition de concurrence (race condition)', category: 'concurrency' },
  { en: 'mutex', fr: 'verrou d\'exclusion mutuelle (mutex)', category: 'concurrency' },
  { en: 'semaphore', fr: 'sémaphore', category: 'concurrency' },
  { en: 'thread pool', fr: 'bassin de threads (thread pool)', category: 'concurrency' },
  { en: 'lock-free', fr: 'sans verrou (lock-free)', category: 'concurrency' },
  { en: 'atomic operation', fr: 'opération atomique', category: 'concurrency' },
  { en: 'compare-and-swap', fr: 'comparer-et-échanger (CAS)', category: 'concurrency' },
  { en: 'context switch', fr: 'changement de contexte', category: 'concurrency' },

  // Memory & OS
  { en: 'garbage collector', fr: 'ramasse-miettes (garbage collector)', category: 'memory' },
  { en: 'memory leak', fr: 'fuite de mémoire', category: 'memory' },
  { en: 'heap allocation', fr: 'allocation sur le tas (heap)', category: 'memory' },
  { en: 'stack overflow', fr: 'débordement de pile (stack overflow)', category: 'memory' },
  { en: 'pointer arithmetic', fr: 'arithmétique des pointeurs', category: 'memory' },
  { en: 'dangling pointer', fr: 'pointeur pendant (dangling pointer)', category: 'memory' },
  { en: 'virtual memory', fr: 'mémoire virtuelle', category: 'memory' },
  { en: 'page fault', fr: 'défaut de page', category: 'memory' },
  { en: 'cache line', fr: 'ligne de cache', category: 'memory' },
  { en: 'cache hit', fr: 'succès de cache', category: 'memory' },
  { en: 'cache miss', fr: 'défaut de cache (cache miss)', category: 'memory' },
  { en: 'buffer overflow', fr: 'dépassement de tampon (buffer overflow)', category: 'memory' },

  // Algorithms & Data Structures
  { en: 'hash map', fr: 'table de hachage', category: 'algorithms' },
  { en: 'hash collision', fr: 'collision de hachage', category: 'algorithms' },
  { en: 'binary search tree', fr: 'arbre binaire de recherche', category: 'algorithms' },
  { en: 'depth-first search', fr: 'parcours en profondeur (DFS)', category: 'algorithms' },
  { en: 'breadth-first search', fr: 'parcours en largeur (BFS)', category: 'algorithms' },
  { en: 'time complexity', fr: 'complexité temporelle', category: 'algorithms' },
  { en: 'space complexity', fr: 'complexité spatiale', category: 'algorithms' },
  { en: 'Big-O notation', fr: 'notation Grand O', category: 'algorithms' },
  { en: 'dynamic programming', fr: 'programmation dynamique', category: 'algorithms' },
  { en: 'linked list', fr: 'liste chaînée', category: 'algorithms' },
  { en: 'queue', fr: 'file d\'attente', category: 'algorithms' },
  { en: 'stack', fr: 'pile d\'exécution', category: 'algorithms' },

  // Systems & Architecture
  { en: 'instruction pipeline', fr: 'pipeline d\'instructions', category: 'architecture' },
  { en: 'branch prediction', fr: 'prédiction de branchement', category: 'architecture' },
  { en: 'out-of-order execution', fr: 'exécution dans le désordre', category: 'architecture' },
  { en: 'register file', fr: 'banc de registres', category: 'architecture' },
  { en: 'system call', fr: 'appel système (syscall)', category: 'systems' },
  { en: 'kernel space', fr: 'espace noyau', category: 'systems' },
  { en: 'user space', fr: 'espace utilisateur', category: 'systems' },
  { en: 'distributed consensus', fr: 'consensus distribué', category: 'systems' },
  { en: 'two-phase commit', fr: 'validation à deux phases (2PC)', category: 'systems' },
  { en: 'throughput', fr: 'débit de traitement', category: 'systems' },
  { en: 'latency', fr: 'latence', category: 'systems' },
  { en: 'fault tolerance', fr: 'tolérance aux pannes', category: 'systems' },
];
