#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct delta__AllocError {
} delta__AllocError;

typedef struct delta__Payload {
	int64_t count;
	int64_t stride;
} delta__Payload;

typedef struct delta__BoxedCounter {
	delta__Payload* payload;
} delta__BoxedCounter;

typedef struct delta_result_BoxedCounter {
	uint8_t tag;
	delta__BoxedCounter value;
} delta_result_BoxedCounter;

typedef struct delta_result_heap_Payload {
	uint8_t tag;
	delta__Payload* value;
} delta_result_heap_Payload;

static inline delta_result_heap_Payload delta_rt_heap_alloc_Payload(delta__Payload value) {
	delta__Payload* p = (delta__Payload*)malloc(sizeof(delta__Payload));
	if (!p) return (delta_result_heap_Payload){ .tag = 1 };
	*p = value;
	return (delta_result_heap_Payload){ .tag = 0, .value = p };
}

static inline void delta_rt_heap_dispose_Payload(delta__Payload* value) {
	if (!value) return;
	(void)value;
	free(value);
}

static void delta_panic(const char *file, int line, const char *msg) {
	fprintf(stderr, "%s:%d: panic: %s\n", file, line, msg);
	abort();
}

static inline int64_t delta_rt_add_i64(int64_t a, int64_t b, const char *file, int line) {
	int64_t r;
	if (__builtin_add_overflow(a, b, &r)) delta_panic(file, line, "arithmetic overflow");
	return r;
}

static inline int32_t delta_rt_conv_i64_to_i32(int64_t v, const char *file, int line) {
	if (v < INT32_MIN || v > INT32_MAX) delta_panic(file, line, "narrowing conversion out of range");
	return (int32_t)v;
}

delta_result_BoxedCounter makeBoxedCounter(int64_t count, int64_t stride);
int64_t delta__BoxedCounter_total(const delta__BoxedCounter* bc);
int64_t payloadTotal(delta__Payload payload);
void delta__BoxedCounter_step(delta__BoxedCounter* bc);
int32_t delta_main();
void delta__BoxedCounter_drop(delta__BoxedCounter* value);

delta_result_BoxedCounter makeBoxedCounter(int64_t count, int64_t stride) {
	delta_result_heap_Payload __delta_result_0 = delta_rt_heap_alloc_Payload((delta__Payload){ .count = count, .stride = stride });
	if (__delta_result_0.tag != 0) {
		return (delta_result_BoxedCounter){ .tag = 1 };
	}
	delta__Payload* p = __delta_result_0.value;
	return (delta_result_BoxedCounter){ .tag = 0, .value = (delta__BoxedCounter){ .payload = p } };
}

int64_t delta__BoxedCounter_total(const delta__BoxedCounter* bc) {
	return (bc->payload->count + bc->payload->stride);
}

int64_t payloadTotal(delta__Payload payload) {
	return (payload.count + payload.stride);
}

void delta__BoxedCounter_step(delta__BoxedCounter* bc) {
	bc->payload->count = delta_rt_add_i64(bc->payload->count, bc->payload->stride, "test-source/tests/heap-codegen/basic_heap.delta", 22);
}

int32_t delta_main() {
	delta_result_BoxedCounter __delta_result_1 = makeBoxedCounter((int64_t)(10), (int64_t)(3));
	if (__delta_result_1.tag != 0) {
		return 1;
	}
	delta__BoxedCounter bc = __delta_result_1.value;
	delta__BoxedCounter_step(&bc);
	int32_t __delta_return_0 = delta_rt_conv_i64_to_i32(payloadTotal((*(bc.payload))), "test-source/tests/heap-codegen/basic_heap.delta", 31);
	delta__BoxedCounter_drop(&bc);
	return __delta_return_0;
}

void delta__BoxedCounter_drop(delta__BoxedCounter* value) {
	delta_rt_heap_dispose_Payload(value->payload);
}

int main() {
	return (int)delta_main();
}
