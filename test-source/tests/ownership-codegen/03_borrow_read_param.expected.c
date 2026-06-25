#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Counter {
	int32_t value;
} delta__Counter;

int32_t inspect(const delta__Counter* counter);
int32_t delta_main();

int32_t inspect(const delta__Counter* counter) {
	return counter->value;
}

int32_t delta_main() {
	delta__Counter counter = (delta__Counter){ .value = 7 };
	return inspect(&counter);
}

int main() {
	return (int)delta_main();
}
