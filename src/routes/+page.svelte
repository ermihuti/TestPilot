<script>
  import { onMount } from 'svelte';
  let url = '';
  let loading = false;
  let report = null;
  let error = null;

  async function startAnalysis() {
    loading = true;
    error = null;
    report = null;
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) throw new Error('Failed to start analysis');
      report = await res.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div>
  <h1>Website AI Analyzer</h1>
  <input
    type="url"
    placeholder="Enter website URL"
    bind:value={url}
    style="width: 400px"
  />
  <button on:click={startAnalysis} disabled={loading || !url}>
    {loading ? 'Analyzing...' : 'Start Analysis'}
  </button>
</div>

{#if error}
  <p style="color:red">{error}</p>
{/if}

{#if report}
  <h2>Analysis Complete</h2>
  <p>Summary PDF: <a href={report.summaryPdf} target="_blank">Download</a></p>
  <p>Details PDF: <a href={report.detailsPdf} target="_blank">Download</a></p>
{/if}
