#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Counter {
	int32_t value;
} delta__Counter;

int32_t delta__Counter_get(const delta__Counter* counter);
void delta__Counter_bump(delta__Counter* counter);
int32_t delta_main();

int32_t delta__Counter_get(const delta__Counter* counter) {
	return counter->value;
}

void delta__Counter_bump(delta__Counter* counter) {
	counter->value = (counter->value + 1);
}

int32_t delta_main() {
	delta__Counter counter = (delta__Counter){ .value = 7 };
	delta__Counter_bump(&counter);
	return delta__Counter_get(&counter);
}

int main() {
	return (int)delta_main();
}
