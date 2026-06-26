document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';

// vitest-browser-svelte appends a plain <div> to body as the render container.
// Without this rule the terminal's height:100% resolves against that div's
// height:auto, collapsing it to 0 and leaving the terminal at 1 row regardless
// of the viewport setting. Inline styles from renderSized() override this rule.
const style = document.createElement('style');
style.textContent = 'body > div { height: 100%; }';
document.head.appendChild(style);
