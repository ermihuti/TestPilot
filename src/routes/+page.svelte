<script>
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
      if (!res.ok) throw new Error((await res.json()).error || 'Analysis failed');
      report = await res.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div>
  <h1>Website Analyzer</h1>
  <input type="url" placeholder="Enter website URL" bind:value={url} style="width:400px" />
  <button on:click={startAnalysis} disabled={loading||!url}>
    {loading ? 'Analyzing…' : 'Start Analysis'}
  </button>
</div>

{#if error}
  <p style="color:red">{error}</p>
{:else if report}
  <h2>Report</h2>
  <p><strong>Timestamp:</strong> {report.timestamp}</p>
  <h3>Detected Changes</h3>
  {#if report.changes.length}
    <ul>{#each report.changes as c}<li>{c}</li>{/each}</ul>
  {:else}
    <p>No changes detected.</p>
  {/if}
  <h3>Full JSON Report</h3>
  <pre>{JSON.stringify(report,null,2)}</pre>
{/if}