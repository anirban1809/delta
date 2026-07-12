/* Generated C (illustrative; #line omitted) — move is compile-time; the moved-from
   binding is elided from scope-exit cleanup (no double free). */
#include <stdint.h>

typedef struct { int64_t* value; } delta__Counter;

int32_t main(void) {
    delta__Counter a = { .value = delta_rt_box_i64(0) };
    delta__Counter b = a;        /* move: `a` dead hereafter */
    delta_rt_free(b.value);      /* scope exit: free live owner `b` only */
    return 0;
}
