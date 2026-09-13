<p align="center">
  <img width="180" src="./icon.png">
  <h1 align="center">CRX Installer</h1>
  <div align="center">Install Chrome extension to Floorp/Firefox Nightly/Librewolf</div>
</p>

> [!CAUTION]
> Installing untrusted extensions can pose a serious security risk.
> Developer will not responsible for any damage caused by the user's actions.
> Always act prudently and at your own risk.

> [!IMPORTANT]
> I recommend using this extension with the following supported browsers.
> It will work with the regular version of Firefox, but additional steps are required.

# Tested browsers
* Floorp (Recommended)
* Firefox Nightly
* Firefox Developer Edition
* Librewolf
* Zen browser

***Except for Floorp, value of `xpinstall.signatures.required` have to set `false` in `about:config`.***

***DOES NOT WORK FOR REGULAR FIREFOX BECAUSE OF MOZ_REQUIRE_SIGNING COMPILER SETTING!!!***
This litteraly means xpinstall.signatures.required is fucking ignored on non ESR, firefox android
It is not ignored however on ESR, Developer Edition, Nightly
