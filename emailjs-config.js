/* ============================================================
   One Trip Car Rent — EmailJS configuration (REAL email delivery)
   ------------------------------------------------------------
   The booking engine (booking-core.js → OTB.sendConfirmation) sends
   a REAL confirmation email to the customer via EmailJS as soon as
   the three IDs below are filled in. Until then every send is just
   recorded as 'simulated' (visible in: admin.html → الإيميلات).

   Sender (From): carrent@onetrip.sa

   ── HOW TO TURN ON REAL SENDING (≈5 min, free, no server needed) ──
   1) Create a free account at  https://www.emailjs.com
   2) Email Services → Add New Service → connect the mailbox that
      sends from carrent@onetrip.sa:
        • Custom SMTP  (host / port / user=carrent@onetrip.sa / password), or
        • Gmail / Outlook if that mailbox lives there.
      → copy the Service ID  (looks like  service_xxxxxxx)
   3) Email Templates → Create New Template. In the template body use
      these variables, and set the fields shown:
        Subject:     {{subject}}
        Content:     {{message}}
        To Email:    {{to_email}}
        To Name:     {{to_name}}
        From Name:   One Trip Car Rent
        Reply To:    carrent@onetrip.sa
      → copy the Template ID  (looks like  template_xxxxxxx)
   4) Account → General → copy your Public Key.
   5) Paste the three values below and save this file. That's it —
      next booking will actually email the customer, and the status
      in the admin "الإيميلات" tab flips from «محاكاة» to «أُرسل».
   ============================================================ */
window.OTB_EMAILJS = {
  serviceId:  '',   // e.g. 'service_ab12cd3'
  templateId: '',   // e.g. 'template_xy98zw7'
  publicKey:  ''    // e.g. 'AbCdEfGhIjKlMnOp'
};

/* initialise the EmailJS SDK once (only if it's loaded and a key is set) */
(function(){
  try{
    var c = window.OTB_EMAILJS;
    if(c && c.publicKey && window.emailjs && window.emailjs.init){
      window.emailjs.init(c.publicKey);
    }
  }catch(e){}
})();
