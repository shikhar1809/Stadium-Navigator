import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    '>Sign out<': ' data-i18n="sign_out">Sign out<',
    '🎟️</span>Your Ticket<': '🎟️</span><span data-i18n="your_ticket">Your Ticket</span><',
    '>Section Number<': ' data-i18n="section_number">Section Number<',
    '>\n          Please enter a valid section number (101–149, 201–250, or 301–350).\n        <': ' data-i18n="section_error">\n          Please enter a valid section number (101–149, 201–250, or 301–350).\n        <',
    '>Language<': ' data-i18n="language">Language<',
    '<label>Accessibility Needs <span class="text-muted">(optional)</span></label>': '<label><span data-i18n="accessibility_needs">Accessibility Needs (optional)</span></label>',
    '>Mobility / Wheelchair ♿<': ' data-i18n="mobility_title">Mobility / Wheelchair ♿<',
    '>Routes you to the nearest step-free ramp gate<': ' data-i18n="mobility_desc">Routes you to the nearest step-free ramp gate<',
    '>Vision / Low Vision 👁<': ' data-i18n="vision_title">Vision / Low Vision 👁<',
    '>All updates spoken aloud via device audio<': ' data-i18n="vision_desc">All updates spoken aloud via device audio<',
    '>Hearing / Deaf 🦻<': ' data-i18n="hearing_title">Hearing / Deaf 🦻<',
    '>Updates shown as large high-contrast banners<': ' data-i18n="hearing_desc">Updates shown as large high-contrast banners<',
    '>\n        Use Demo Ticket\n      <': ' data-i18n="use_demo">\n        Use Demo Ticket\n      <',
    '>\n        Find My Gate →\n      <': ' data-i18n="find_gate">\n        Find My Gate →\n      <',
    '📍</span>Your Assigned Gate<': '📍</span><span data-i18n="assigned_gate">Your Assigned Gate</span><',
    '>\n            ♿ Rerouted to step-free gate\n          <': ' data-i18n="rerouted">\n            ♿ Rerouted to step-free gate\n          <',
    '>\n        Watch Match Updates →\n      <': ' data-i18n="watch_match">\n        Watch Match Updates →\n      <',
    '>Match Status<': ' data-i18n="match_status">Match Status<',
    '>Minute<': ' data-i18n="minute">Minute<',
    '>Repeat<': ' data-i18n="repeat">Repeat<',
    '📍</span>Your Gate<': '📍</span><span data-i18n="your_gate">Your Gate</span><',
    '📊</span>Live Gate Congestion<': '📊</span><span data-i18n="live_congestion">Live Gate Congestion</span><',
    '>\n        ⏭ Skip to Full Time\n      <': ' data-i18n="skip_fulltime">\n        ⏭ Skip to Full Time\n      <',
    '>Full Time!<': ' data-i18n="full_time_title">Full Time!<',
    '>The match is over. How can we help you get home?<': ' data-i18n="full_time_desc">The match is over. How can we help you get home?<',
    '>Need Help?<': ' data-i18n="need_help">Need Help?<',
    '>Connect with stadium staff for assistance<': ' data-i18n="need_help_desc">Connect with stadium staff for assistance<',
    '>Give Me Directions<': ' data-i18n="give_directions">Give Me Directions<',
    '>AI-powered personalised exit route<': ' data-i18n="give_directions_desc">AI-powered personalised exit route<',
    '>Getting your directions…<': ' data-i18n="loading_directions">Getting your directions…<',
    '>Rechecking gates in<': ' data-i18n="rechecking">Rechecking gates in<',
    '>\n        ← Back\n      <': ' data-i18n="back">\n        ← Back\n      <',
    '>\n        New Ticket\n      <': ' data-i18n="new_ticket">\n        New Ticket\n      <'
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Done!')
