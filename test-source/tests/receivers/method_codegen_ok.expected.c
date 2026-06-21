#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Counter {
    int32_t value;
} delta__Counter;

int32_t delta__Counter_get(const delta__Counter* c);
void delta__Counter_set(delta__Counter* c, int32_t n);
int32_t delta_main();

int32_t delta__Counter_get(const delta__Counter* c) {
    return c->value;
}

void delta__Counter_set(delta__Counter* c, int32_t n) {
    c->value = n;
}

int32_t delta_main() {
    delta__Counter c = (delta__Counter){ .value = 7 };
    delta__Counter_set(&c, 10);
    return delta__Counter_get(&c);
}

int main() {
    return (int)delta_main();
}
