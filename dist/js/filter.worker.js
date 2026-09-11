import { applyFilter } from "./image-filters.js";

self.addEventListener("message", ({ data }) => {
  try {
    const source = new Uint8ClampedArray(data.buffer);
    const result = applyFilter(source, data.width, data.height, data.options, (value) => {
      self.postMessage({ job: data.job, kind: "progress", value });
    });
    self.postMessage({ job: data.job, kind: "complete", buffer: result.buffer }, [result.buffer]);
  } catch (error) {
    self.postMessage({ job: data.job, kind: "failure", message: error.message });
  }
});
