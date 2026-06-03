#include <stdint.h>
#include <stdbool.h>

bool decide(bool a, bool b, bool c);
int32_t neg(int32_t x);
int32_t delta_main();

bool decide(bool a, bool b, bool c) {
    return a && b || !c;
}

int32_t neg(int32_t x) {
    return -x;
}

int32_t delta_main() {
    if (decide(true, false, false)) {
        return neg(7);
    } else {
        return 0;
    }
}

int main() {
    return (int)delta_main();
}
