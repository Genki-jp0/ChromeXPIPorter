<p align="center">
  <img src="./icon.png" width="180" alt="CRX Installer icon">
</p>

<h1 align="center">CRX Installer</h1>

<p align="center">
  Install Chrome extensions in Floorp, Firefox Nightly, and LibreWolf.
</p>

> [!CAUTION]
> Installing untrusted extensions can pose a serious security risk.
> The developer is not responsible for damage caused by the user's actions.
> Proceed carefully and at your own risk.

> [!IMPORTANT]
> Use one of the supported browsers listed below. Regular Firefox requires
> additional steps because changing the signature preference alone is not enough.

## Tested browsers

- **Floorp** â€” recommended
- Firefox Nightly
- Firefox Developer Edition
- LibreWolf
- Zen Browser

## Signature verification

Except for Floorp, set the following preference to `false` in `about:config`:

```text
xpinstall.signatures.required = false
```

### Regular Firefox and Firefox for Android

> [!WARNING]
> Setting `xpinstall.signatures.required` to `false` is insufficient in regular
> Firefox builds, including regular Firefox for Android, when the build-time
> `MOZ_REQUIRE_SIGNING` setting enforces signature verification.

In these builds, the preference is ignored. Firefox ESR, Developer Edition,
and Nightly allow the preference to control signature verification.
