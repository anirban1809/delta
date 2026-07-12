/* Generated C (illustrative; #line omitted) — `x.m()` -> `delta__T__m(&x)` */
#include <stdint.h>

typedef struct { int64_t* value; } delta__Counter;

int64_t delta__Counter__get(const delta__Counter* c) {
    return *c->value;
}

int32_t main(void) {
    delta__Counter c = { .value = delta_rt_box_i64(42) };
    const int64_t v = delta__Counter__get(&c);
    delta_rt_free(c.value);
    return (int32_t)v;
}
