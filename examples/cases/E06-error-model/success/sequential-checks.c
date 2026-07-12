/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

typedef struct {
    uint8_t tag;
    union { int64_t ok; struct { } error; } payload;
} delta_result_i64_Overflow;

delta_result_i64_Overflow sumThree(int64_t a, int64_t b, int64_t c) {
    int64_t ab;
    if (__builtin_add_overflow(a, b, &ab)) {
        return (delta_result_i64_Overflow){ .tag = 1 };
    }
    int64_t abc;
    if (__builtin_add_overflow(ab, c, &abc)) {
        return (delta_result_i64_Overflow){ .tag = 1 };
    }
    return (delta_result_i64_Overflow){ .tag = 0, .payload = { .ok = abc } };
}

int32_t main(void) {
    delta_result_i64_Overflow _r0 = sumThree(10, 20, 30);
    if (_r0.tag != 0) { return 1; }
    int64_t total = _r0.payload.ok;
    return (int32_t)total;
}
