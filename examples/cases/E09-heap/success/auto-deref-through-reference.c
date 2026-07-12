/* Generated C (illustrative; #line omitted) — `bc.payload.count` -> `bc->payload->count` */
#include <stdint.h>

typedef struct { int64_t count; int64_t stride; } delta__Payload;
typedef struct { delta__Payload* payload; } delta__BoxedCounter;

typedef struct { uint8_t tag; union { delta__Payload* ok; struct { } error; } payload; }
    delta_result_heapPayload_Alloc;
typedef struct { uint8_t tag; union { delta__BoxedCounter ok; struct { } error; } payload; }
    delta_result_BoxedCounter_Alloc;

delta_result_BoxedCounter_Alloc makeBoxedCounter(int64_t count, int64_t stride) {
    delta_result_heapPayload_Alloc _r = delta_rt_heap_alloc_Payload(
        (delta__Payload){ .count = count, .stride = stride });
    if (_r.tag != 0) { return (delta_result_BoxedCounter_Alloc){ .tag = 1 }; }
    delta__Payload* p = _r.payload.ok;
    return (delta_result_BoxedCounter_Alloc){ .tag = 0, .payload = { .ok = { .payload = p } } };
}

int64_t total(const delta__BoxedCounter* bc) {
    return bc->payload->count + bc->payload->stride;
}

int32_t main(void) {
    delta_result_BoxedCounter_Alloc _r0 = makeBoxedCounter(3, 4);
    if (_r0.tag != 0) { return 1; }
    delta__BoxedCounter bc = _r0.payload.ok;
    int32_t out = (int32_t)total(&bc);
    delta_rt_free(bc.payload);
    return out;
}
