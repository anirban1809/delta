#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Handle {
	int32_t id;
} delta__Handle;

void consume(delta__Handle value);
int32_t delta_main();

void consume(delta__Handle value) {
}

int32_t delta_main() {
	delta__Handle value = (delta__Handle){ .id = 7 };
	consume(value);
	return 0;
}

int main() {
	return (int)delta_main();
}
