import { ScrollViewStyleReset } from 'expo-router/html';
import '../unistyles';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Guard against custom element re-registration errors from third-party scripts (e.g. browser
            extensions or co-deployed services that call customElements.define() more than once for the
            same name). This must run before any other script so the patch is in place from page load. */}
        <script dangerouslySetInnerHTML={{ __html: customElementsGuard }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

// Patch customElements.define to silently skip re-registration of already-defined elements.
// Prevents "A custom element with name '...' has already been defined" errors thrown by
// third-party scripts (browser extensions, co-deployed services) on SPA navigations.
const customElementsGuard = `(function(){
  if(typeof customElements==='undefined')return;
  var _orig=customElements.define.bind(customElements);
  customElements.define=function(name,ctor,opts){
    if(!customElements.get(name))_orig(name,ctor,opts);
  };
})();`;

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
