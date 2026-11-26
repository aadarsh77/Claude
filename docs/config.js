/* કાર્ય મેટ્રિક્સ — સિંક સેટિંગ
 *
 * બંને ખાના ખાલી હોય ત્યાં સુધી એપ ફક્ત આ ફોનમાં જ સેવ કરે છે (સિંક બંધ).
 * સિંક ચાલુ કરવા નીચેની બે કિંમત ભરો — Supabase માં:
 *   Project Settings → Data API → Project URL  અને  anon public key
 *
 * આ બંને જાહેર કિંમતો છે અને જાહેર કોડમાં રહે એ બરાબર છે.
 * તમારી યાદીનું રક્ષણ આ ચાવીથી નહીં, Supabase ના Row Level Security થી થાય છે
 * (schema.sql એ ગોઠવે છે) — એટલે schema.sql ચલાવ્યા વગર સિંક ચાલુ ન કરશો.
 */
window.KMX_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
