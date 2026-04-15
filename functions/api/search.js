export async function onRequestPost(context) {
  var AK = context.env.ANTHROPIC_API_KEY;
  var TK = context.env.TMDB_API_KEY;
  try {
    var body = await context.request.json();
    var query = body.query || "";
    if (!query.trim()) return resp([]);
    var aiResults = [];
    if (AK) {
      try {
        var cr = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1200,
            system: "Role: Advanced AI recommendation engine for ALL visual media.\nGoal: Deep semantic understanding of user query - intent, mood, genre, visual style, era.\nExamples:\n- 'Бункер для богачей' -> Silo, The Platform, Snowpiercer, Parasite\n- 'красочный фильм с загадками' -> Knives Out, Coco, Grand Budapest Hotel\n- 'страшный сериал' -> Stranger Things, Haunting of Hill House, Dark\n- 'смешной мультик' -> Inside Out, Zootopia, Shrek\n- 'космос как интерстеллар' -> Interstellar, Arrival, Ad Astra, Gravity\nRules:\n1. Support ALL languages. Return English titles\n2. Priority: exact title > close match > semantic > contextual\n3. ALL types: movies, series, cartoons, anime, docs. type=movie or tv\n4. NEVER empty results. Return 10-15 items\n5. Sort by relevance\nOutput ONLY JSON array:\n[{\"title\":\"Name\",\"year\":2024,\"type\":\"movie\"}]",
            messages: [{ role: "user", content: query }]
          })
        });
        if (cr.ok) { var cd = await cr.json(); var txt = (cd.content && cd.content[0] && cd.content[0].text) || "[]"; try { aiResults = JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch (e) {} }
      } catch (e) {}
    }
    var results = [];
    if (aiResults.length > 0) {
      var enriched = await Promise.all(aiResults.slice(0, 12).map(async function(ai) {
        try {
          var mt = ai.type === "tv" ? "tv" : "movie";
          var sr = await fetch("https://api.themoviedb.org/3/search/" + mt + "?api_key=" + TK + "&query=" + encodeURIComponent(ai.title) + "&year=" + (ai.year || ""));
          var sd = await sr.json(); var m = sd.results && sd.results[0]; if (!m) return null;
          var dr = await fetch("https://api.themoviedb.org/3/" + mt + "/" + m.id + "?api_key=" + TK + "&append_to_response=credits,videos");
          var d = await dr.json(); var vids = (d.videos && d.videos.results) || [];
          var tr = vids.find(function(x) { return x.type === "Trailer" && x.site === "YouTube"; }) || vids.find(function(x) { return x.site === "YouTube"; });
          if (mt === "movie") { var h = Math.floor((d.runtime || 0) / 60), mn = (d.runtime || 0) % 60; return { id: d.id, title: d.title, year: d.release_date ? new Date(d.release_date).getFullYear() : null, duration: d.runtime ? h + "h " + mn + "m" : null, genre: d.genres && d.genres[0] ? d.genres[0].name : null, rating: Math.round((d.vote_average || 0) * 10) / 10, poster: d.poster_path ? "https://image.tmdb.org/t/p/w500" + d.poster_path : null, backdrop: d.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + d.backdrop_path : null, desc: d.overview || "", trailer: tr ? "https://www.youtube.com/embed/" + tr.key : null, type: "movie" }; }
          return { id: d.id, title: d.name || d.original_name, year: d.first_air_date ? new Date(d.first_air_date).getFullYear() : null, duration: d.number_of_seasons ? d.number_of_seasons + " seasons" : null, genre: d.genres && d.genres[0] ? d.genres[0].name : null, rating: Math.round((d.vote_average || 0) * 10) / 10, poster: d.poster_path ? "https://image.tmdb.org/t/p/w500" + d.poster_path : null, backdrop: d.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + d.backdrop_path : null, desc: d.overview || "", trailer: tr ? "https://www.youtube.com/embed/" + tr.key : null, type: "tv", numSeasons: d.number_of_seasons || 0, numEpisodes: d.number_of_episodes || 0 };
        } catch (e) { return null; }
      }));
      results = enriched.filter(Boolean);
    }
    if (results.length < 5 && TK) {
      try {
        var sr2 = await fetch("https://api.themoviedb.org/3/search/multi?api_key=" + TK + "&query=" + encodeURIComponent(query) + "&page=1");
        var sd2 = await sr2.json(); var ids = {}; results.forEach(function(r) { ids[r.id + "_" + r.type] = 1; });
        var extras = (sd2.results || []).filter(function(m) { return (m.media_type === "movie" || m.media_type === "tv") && !ids[m.id + "_" + m.media_type]; }).slice(0, 15 - results.length).map(function(m) { var isTV = m.media_type === "tv"; return { id: m.id, title: isTV ? (m.name || m.original_name) : m.title, year: (isTV ? m.first_air_date : m.release_date) ? new Date(isTV ? m.first_air_date : m.release_date).getFullYear() : null, rating: Math.round((m.vote_average || 0) * 10) / 10, poster: m.poster_path ? "https://image.tmdb.org/t/p/w500" + m.poster_path : null, backdrop: m.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + m.backdrop_path : null, desc: m.overview || "", type: m.media_type }; });
        results = results.concat(extras);
      } catch (e) {}
    }
    return resp(results);
  } catch (e) { return resp([]); }
}
function resp(r) { return new Response(JSON.stringify({ results: r }), { headers: { "Content-Type": "application/json" } }); }
