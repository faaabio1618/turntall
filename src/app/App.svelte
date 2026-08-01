<script lang="ts">
  import { onMount } from "svelte";
  import Dialogs from "../components/dialogs/Dialogs.svelte";
  import Editor from "../components/editor/Editor.svelte";
  import Header from "../components/layout/Header.svelte";
  import SeoFooter from "../components/layout/SeoFooter.svelte";

  onMount(() => {
    void import("../editor/controller.ts");
  });
</script>

<main>
  <Header />
  <Editor />
</main>

<SeoFooter />
<Dialogs />
