#include <stdint.h>
#include <stdbool.h>

void noop();
int32_t delta_main();

void noop() {
    
}

int32_t delta_main() {
    noop();
    return 0;
}

int main() {
    return (int)delta_main();
}
