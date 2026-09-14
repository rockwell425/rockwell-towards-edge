(() => {
  const clearButton = document.querySelector("#clearButton");
  clearButton?.addEventListener("click", (event) => {
    const ok = confirm("清除当前结果不会删除“最近记录”中的存档。确定清除当前结果吗？");
    if (!ok) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
