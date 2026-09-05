import { mount } from "svelte";
import App from "./App.svelte";
import "./style.css";

const target = document.querySelector("#app");
if (!(target instanceof HTMLElement)) {
  throw new Error("Missing #app mount point");
}

target.replaceChildren();
const app = mount(App, {
  target,
});

export default app;
