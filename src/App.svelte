<script>
  import { onMount } from "svelte";
  import Dialogs from "./components/Dialogs.svelte";
  import Editor from "./components/Editor.svelte";
  import Header from "./components/Header.svelte";
  import SeoFooter from "./components/SeoFooter.svelte";

  onMount(() => {
    void import("./editor.js");
  });
</script>

<main>
  <Header />
  <Editor />
</main>

<SeoFooter />
<Dialogs />
