// Shows a "Stop!" warning in the browser console (like Facebook and Instagram do).
// Scammers trick people into pasting code here to take over their account ("self-XSS").
// This is only a warning for customers. It does not make the site more secure by itself.

const showConsoleWarning = () => {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  try {
    console.log(
      '%cStop!',
      'color:#e11d1d;font-size:56px;font-weight:bold;-webkit-text-stroke:1px #000;'
    );
    console.log(
      '%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to get a free rental, a discount, or to "fix" your booking or account, it is a scam and will give them access to your ArlTrack account.',
      'font-size:18px;line-height:1.5;'
    );
    console.log(
      '%cNever paste anything here that you do not understand.',
      'font-size:18px;font-weight:bold;line-height:1.5;'
    );
  } catch {
    /* never let a console message break the app */
  }
};

export default showConsoleWarning;
