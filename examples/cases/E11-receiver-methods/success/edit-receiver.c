/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

typedef struct { int64_t* value; } delta__Counter;

void delta__Counter__add(delta__Counter* c, int64_t amount) {
    *c->value = *c->value + amount;
}
int64_t delta__Counter__get(const delta__Counter* c) {
    return *c->value;
}

int32_t main(void) {
    delta__Counter c = { .value = delta_rt_box_i64(0) };
    delta__Counter__add(&c, 5);
    delta__Counter__add(&c, 7);
    const int64_t r = delta__Counter__get(&c);
    delta_rt_free(c.value);
    return (int32_t)r;
}
