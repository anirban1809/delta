/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

typedef struct { int64_t* value; } delta__Counter;

typedef struct { uint8_t tag; union { delta__Counter ok; struct { } error; } payload; }
    delta_result_Counter_Alloc;

int32_t main(void) {
    delta__Counter a = { .value = delta_rt_box_i64(0) };
    delta_result_Counter_Alloc _r0 = delta__Counter__clone(&a);
    if (_r0.tag != 0) { return 1; }
    delta__Counter b = _r0.payload.ok;
    delta_rt_free(b.value);
    delta_rt_free(a.value);      /* `a` is still live */
    return 0;
}
