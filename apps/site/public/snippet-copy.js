(() => {
  let live = document.getElementById("copy-status");
  document.addEventListener("click", (event) => {
    let target = event.target;
    if (!(target instanceof Element)) return;
    let button = target.closest("button[data-copy]");
    if (!(button instanceof HTMLButtonElement)) return;
    let text = document.getElementById(button.dataset.copy ?? "")?.textContent ?? "";
    navigator.clipboard.writeText(text).then(
      () => {
        button.textContent = "Copied";
        if (live) live.textContent = "Copied to the clipboard.";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      },
      () => {
        if (live) live.textContent = "Copy failed. Select the text and copy it.";
      },
    );
  });
})();
