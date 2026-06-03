#include <stdint.h>
#include <stdbool.h>

int32_t fact(int32_t n);
int32_t delta_main();

int32_t fact(int32_t n) {
    int32_t result = 1;
    int32_t i = 1;
    while (i <= n) {
        result = result * i;
        i = i + 1;
    }
    return result;
}

int32_t delta_main() {
    return fact(5);
}

int main() {
    return (int)delta_main();
}
