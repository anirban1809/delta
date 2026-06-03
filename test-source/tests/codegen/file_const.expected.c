#include <stdint.h>
#include <stdbool.h>

int32_t delta_main();

static const int32_t limit = 100;

int32_t delta_main() {
    return limit;
}

int main() {
    return (int)delta_main();
}
