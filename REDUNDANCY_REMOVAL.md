OrderBoard redundancy cleanup

- Removed duplicated user avatar from top bar; account details remain in sidebar.
- Removed repeated navigation group captions and sidebar shortcut banner; keyboard shortcuts still work.
- Removed duplicated branding and reassurance text from sign-in form.
- Removed secondary descriptive paragraphs from order, reservation and cake job toolbars.
- Removed dashboard decorative queue kicker and repeated helper explanations.
- No API, database, role, account or order processing logic changed.

Test: login, desktop/mobile navigation, orders/reservations/cake screens, keyboard shortcuts, role restrictions.
