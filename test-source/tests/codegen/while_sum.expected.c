#include <stdint.h>
#include <stdbool.h>

int32_t delta_main();

int32_t delta_main() {
    int32_t total = 0;
    int32_t i = 1;
    while (i <= 10) {
        total = total + i;
        i = i + 1;
    }
    return total;
}

int main() {
    return (int)delta_main();
}
