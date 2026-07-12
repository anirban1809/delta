/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

int32_t main(void) {
    int32_t sum = 0;
    for (int32_t i = 0; i < 10; i = i + 1) {
        if (i == 5) {
            break;
        }
        sum = sum + i;
    }
    return sum;
}
