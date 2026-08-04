let isLoading = false;

document.addEventListener("click", async e => {
    if (isLoading) return;

    const a = e.target.closest("a.pjax");
    if (!a) return;

    e.preventDefault();
    isLoading = true;

    const url = a.href;
    const res = await fetch(url);
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");

    document.querySelector("#content").innerHTML =
      doc.querySelector("#content").innerHTML;

    history.pushState({}, "", url);
    isLoading = false;
});

window.addEventListener("popstate", async () => {
    const url = location.href;
    const res = await fetch(url);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const newContent = doc.querySelector("#content");
    const oldContent = document.querySelector("#content");

    if (newContent && oldContent) {
        oldContent.innerHTML = newContent.innerHTML;
    }
});
