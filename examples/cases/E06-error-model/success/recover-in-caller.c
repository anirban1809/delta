/* Generated C (illustrative; #line omitted) — `T | E` lowers to a tagged result */
#include <stdint.h>

typedef struct {
    uint8_t tag;                       /* 0 = ok, else error discriminant */
    union { int64_t ok; struct { } error; } payload;
} delta_result_i64_Overflow;

delta_result_i64_Overflow safeAdd(int64_t a, int64_t b) {
    int64_t sum;
    if (__builtin_add_overflow(a, b, &sum)) {
        return (delta_result_i64_Overflow){ .tag = 1 };   /* OverflowError */
    }
    return (delta_result_i64_Overflow){ .tag = 0, .payload = { .ok = sum } };
}

int32_t main(void) {
    delta_result_i64_Overflow _r0 = safeAdd(1000, 999);
    if (_r0.tag != 0) { return 1; }
    int64_t total = _r0.payload.ok;
    return (int32_t)total;
}
