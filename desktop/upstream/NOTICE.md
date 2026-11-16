# Desktop Browser reference

The original `browser-guests.ts` and `preload-browser.ts` in this directory are from
DeepSeek Harness, tag `dsh-v0.2.2-rc.1`, commit
`66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`, under the MIT license in `LICENSE`.

Naumi derives `@naumi/dsh-sidebar-browser` from the installed
`@deepseek-ai/dsh-client-ui-sidebar-browser` 0.2.2-rc.1 client. Four checked
substitutions change its module registration id, preload carrier to
`naumiDesktop`, CSS identity and CSS ownership. ElectronWebViewImpl, BrowserBody, navigation and docking are
otherwise byte-identical. The installed upstream package is unchanged.
`app/guests.cjs` adapts the upstream main-process lease protocol. Differences:
persistent local-account/workspace partitions, session/tab association for the
agent tool, bounded navigation timeout, and native input. No external HWND hosting
or screenshot rendering is used by the desktop client.

This is a Naumi desktop host, not the full official DeepSeek desktop application.
Account switching will require server-verified tenant/employee partition keys;
the current account key is `local`, isolated by the OS user and workspace.
