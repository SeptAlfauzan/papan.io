<script setup lang="ts">

</script>

<template>
  <main>
    <div class="mt-6 flex max-w-md gap-x-4">
      <label for="email-address" class="sr-only">Room Code</label>
      <input
        id="email-address"
        type="text"
        name="room-code"
        required
        placeholder="Enter your room code"
        class="min-w-0 flex-auto rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
      />
      <button
        type="submit"
        class="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Join
      </button>
    </div>
  </main>
</template>
