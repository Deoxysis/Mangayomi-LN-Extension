const mangayomiSources = [{
    "name": "NovelBuddy",
    "lang": "en",
    "baseUrl": "https://novelbuddy.me",
    "apiUrl": "",
    "iconUrl": "https://novelbuddy.me/images/logo.png",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
    "pkgPath": "novel/src/en/novelbuddy.js",
    "notes": ""
}];


class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        };
    }
    
    async getBooks(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const bookList = [];
        
        const nextDataEl = doc.selectFirst("script#__NEXT_DATA__");
        if (nextDataEl) {
            try {
                let jsonStr = nextDataEl.text;
                if (!jsonStr) {
                    const htmlContent = nextDataEl.innerHtml || nextDataEl.outerHtml;
                    const match = htmlContent.match(/>([\s\S]*?)<\/script>/) || htmlContent.match(/>([\s\S]*)$/);
                    jsonStr = match ? match[1] : htmlContent;
                }
                const nextData = JSON.parse(jsonStr);
                const items = nextData.props.pageProps.ssrItems || nextData.props.pageProps.items || [];
                
                for (const item of items) {
                    if (item.name && item.url) {
                        bookList.push({
                            'name': item.name,
                            'link': `${this.source.baseUrl}${item.url}`,
                            'imageUrl': item.cover ? (item.cover.startsWith('http') ? item.cover : `${this.source.baseUrl}${item.cover}`) : ""
                        });
                    }
                }
            } catch (e) {
                console.log("JSON Parse Error: " + e);
            }
        }
        
        if (bookList.length === 0) {
            const books = doc.select('article, .novel-item, .list-novel .row');
            for (const book of books) {
                const linkEl = book.selectFirst('a');
                if (!linkEl) continue;
                const href = linkEl.attr("href");
                if (!href) continue;
                
                const bookLink = href.startsWith('http') ? href : `${this.source.baseUrl}${href}`;
                
                const imgEl = linkEl.selectFirst('img');
                const imgAttr = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src")) : "";
                const imageUrl = imgAttr.startsWith('http') ? imgAttr : `${this.source.baseUrl}${imgAttr}`;
                
                const bookTitle = imgEl ? (imgEl.attr("title") || imgEl.attr("alt")) : "Unknown Title";
              
                bookList.push({
                    'name': bookTitle,
                    'link': bookLink,
                    'imageUrl': imageUrl
                });
            } 
        }
        
        //for some reason NovelBuddy relies on page buttons
        const nextButton = doc.selectFirst("a[rel='next'], a:contains('Next')");
        let hasNextPage = false;
        if (nextButton && nextButton.attr("href") && nextButton.attr("href") !== "#") {
          hasNextPage = true;
        }
        
        return {'list': bookList, 'hasNextPage': hasNextPage};
    }
    
    async getPopular(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/ranking?page=${page}`;
        return await this.getBooks(url);
    }
    
    get supportsLatest() {
        return true;
    }
    
    async getLatestUpdates(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/latest?page=${page}`;
        return await this.getBooks(url);
    }
    
    async search(query, page, filters) {
        const baseUrl = this.source.baseUrl;
        let searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&page=${page}`;
        
        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    if (filter.name === "Status" && filter.values[filter.state].value) {
                        searchUrl += `&status=${filter.values[filter.state].value}`;
                    } else if (filter.name === "Sort" && filter.values[filter.state].value) {
                        searchUrl += `&sort=${filter.values[filter.state].value}`;
                    }
                } else if (filter.type_name === "TextFilter") {
                    if (filter.name === "Author" && filter.state) {
                        searchUrl += `&author=${encodeURIComponent(filter.state)}`;
                    }
                } else if (filter.type_name === "GroupFilter") {
                    if (filter.name === "Included Genres") {
                        const included = [];
                        for (const genre of filter.state) {
                            if (genre.state) {
                                included.push(genre.value);
                            }
                        }
                        if (included.length > 0) {
                            searchUrl += `&genres=${encodeURIComponent(included.join(','))}`;
                        }
                    } else if (filter.name === "Excluded Genres") {
                        const excluded = [];
                        for (const genre of filter.state) {
                            if (genre.state) {
                                excluded.push(genre.value);
                            }
                        }
                        if (excluded.length > 0) {
                            searchUrl += `&exclude=${encodeURIComponent(excluded.join(','))}`;
                        }
                    }
                }
            }
        }
        
        return await this.getBooks(searchUrl);
    }
    
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const bookTitle = doc.selectFirst("h1") ? doc.selectFirst("h1").text : "";
        
        const imgEl = doc.selectFirst(`img[alt="${bookTitle}"]`) || doc.selectFirst('img');
        const imgLink = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src")) : "";
        
        const descEl = doc.selectFirst('meta[name="description"]');
        const bookDescription = descEl ? descEl.attr("content") : "";
        
        const authorEl = doc.selectFirst('a[href*="/authors/"]');
        const bookAuthor = authorEl ? authorEl.text : "";
        
        const bookGenres = [];
        const genreEls = doc.select('a[href*="/genres/"]');
        for (const el of genreEls) {
            bookGenres.push(el.text);
        }
    
        const statusEl = doc.selectFirst('span:contains("RELEASING"), span:contains("COMPLETED")');
        let status = 0;
        if (statusEl) {
            const statusText = statusEl.text.toUpperCase();
            if (statusText.includes("RELEASING")) status = 1;
            else if (statusText.includes("COMPLETED")) status = 2;
        }
          
        const chaptersList = [];
        
        //extract novel ID 
        const idMatch = res.body.match(/"mangaHsid":"([^"]+)"/) || res.body.match(/"initialManga":\{"id":"([^"]+)"/);
        
        if (idMatch && idMatch[1]) {
            const novelId = idMatch[1];
            try {
                const apiRes = await client.get(`https://api.novelbuddy.me/titles/${novelId}/chapters`, this.getHeaders(url));
                const apiJson = JSON.parse(apiRes.body);
                if (apiJson.data && apiJson.data.chapters) {
                    for (const chapter of apiJson.data.chapters) {
                        let chapName = chapter.name;
                        const chapUrl = chapter.url;
                        
                        let chapterNumber = 0;
                        const numMatch = chapName.match(/(?:Vol\.|Volume|Chapter)\s*(\d+(?:\.\d+)?)/i);
                        if (numMatch) {
                            chapterNumber = parseFloat(numMatch[1]);
                        }
                        
                        if (chapUrl.includes("-year-")) {
                            const yearMatch = chapUrl.match(/-year-(\d+)/);
                            if (yearMatch) chapName = "Year " + yearMatch[1] + " " + chapName;
                        } else if (chapUrl.includes("-season-")) {
                            const seasonMatch = chapUrl.match(/-season-(\d+)/);
                            if (seasonMatch) chapName = "Season " + seasonMatch[1] + " " + chapName;
                        }

                        chaptersList.push({
                            'name': chapName,
                            'url': chapUrl.startsWith('http') ? chapUrl : `${this.source.baseUrl}${chapUrl}`,
                            'chapterNumber': chapterNumber,
                            'scanlator': ""
                        });
                    }
                }
            } catch (e) {
                console.log("Chapter API Error: " + e);
            }
        }
        
        //fallback for HTML parsing 
        if (chaptersList.length === 0) {
            const chapterEls = doc.select("ul.divide-y li, .list-chapter li");
            for (const element of chapterEls) {
                const linkEl = element.selectFirst("a");
                if (!linkEl) continue;
                
                let chapterTitle = linkEl.text.trim();
                const chapterUrl = linkEl.attr("href");
                if (chapterUrl && chapterTitle) {
                    let chapterNumber = 0;
                    const numMatch = chapterTitle.match(/(?:Vol\.|Volume|Chapter)\s*(\d+(?:\.\d+)?)/i);
                    if (numMatch) {
                        chapterNumber = parseFloat(numMatch[1]);
                    }
                    
                    if (chapterUrl.includes("-year-")) {
                        const yearMatch = chapterUrl.match(/-year-(\d+)/);
                        if (yearMatch) chapterTitle = "Year " + yearMatch[1] + " " + chapterTitle;
                    } else if (chapterUrl.includes("-season-")) {
                        const seasonMatch = chapterUrl.match(/-season-(\d+)/);
                        if (seasonMatch) chapterTitle = "Season " + seasonMatch[1] + " " + chapterTitle;
                    }

                    chaptersList.push({
                        'name': chapterTitle,
                        'url': chapterUrl.startsWith('http') ? chapterUrl : `${this.source.baseUrl}${chapterUrl}`,
                        'chapterNumber': chapterNumber,
                        'scanlator': ""
                    });
                }
            }
        }
    
        return {
          'name': bookTitle,
          'link': url,
          'imageUrl': imgLink.startsWith('http') ? imgLink : `${this.source.baseUrl}${imgLink}`,
          'description': bookDescription,
          'author': bookAuthor,
          'genre': bookGenres,
          'status': status,
          'chapters': chaptersList
        }
    }
    
    
    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const chapterContent = doc.selectFirst("article") || doc.selectFirst(".chapter-content") || doc.selectFirst("#content") || doc.selectFirst("body");
        return chapterContent ? chapterContent.outerHtml : "";
    }
    
    async cleanHtmlContent(html) {
        const doc = new Document(html);
        const paragraphs = doc.select("p");
        
        let cleanedHtml = "";
        for (const p of paragraphs) {
            cleanedHtml += p.outerHtml;
        }
        
        return cleanedHtml || html;
    }
    
    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "Best Match" },
                    { type_name: "SelectOption", value: "latest", name: "Latest Updated" },
                    { type_name: "SelectOption", value: "newest", name: "Recently Added" },
                    { type_name: "SelectOption", value: "popular", name: "Most Followed" },
                    { type_name: "SelectOption", value: "rating", name: "Highest Rating" },
                    { type_name: "SelectOption", value: "views_today", name: "Most Viewed: Today" },
                    { type_name: "SelectOption", value: "views_7days", name: "Most Viewed: 7 Days" },
                    { type_name: "SelectOption", value: "views_30days", name: "Most Viewed: 30 Days" },
                    { type_name: "SelectOption", value: "views", name: "Most Viewed: All Time" },
                    { type_name: "SelectOption", value: "chapters", name: "Most Chapters" },
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "Any" },
                    { type_name: "SelectOption", value: "ongoing", name: "Ongoing" },
                    { type_name: "SelectOption", value: "completed", name: "Completed" }
                ]
            },
            {
                type_name: "TextFilter",
                name: "Author",
                state: ""
            },
            {
                type_name: "GroupFilter",
                name: "Included Genres",
                state: [
                    { type_name: "CheckBox", name: "Action", value: "action", state: false },
                    { type_name: "CheckBox", name: "Adult", value: "adult", state: false },
                    { type_name: "CheckBox", name: "Adventure", value: "adventure", state: false },
                    { type_name: "CheckBox", name: "Comedy", value: "comedy", state: false },
                    { type_name: "CheckBox", name: "Drama", value: "drama", state: false },
                    { type_name: "CheckBox", name: "Eastern", value: "eastern", state: false },
                    { type_name: "CheckBox", name: "Ecchi", value: "ecchi", state: false },
                    { type_name: "CheckBox", name: "Fan-Fiction", value: "fan-fiction", state: false },
                    { type_name: "CheckBox", name: "Fantasy", value: "fantasy", state: false },
                    { type_name: "CheckBox", name: "Game", value: "game", state: false },
                    { type_name: "CheckBox", name: "Gender Bender", value: "gender-bender", state: false },
                    { type_name: "CheckBox", name: "Harem", value: "harem", state: false },
                    { type_name: "CheckBox", name: "Historical", value: "historical", state: false },
                    { type_name: "CheckBox", name: "Horror", value: "horror", state: false },
                    { type_name: "CheckBox", name: "Josei", value: "josei", state: false },
                    { type_name: "CheckBox", name: "Martial Arts", value: "martial-arts", state: false },
                    { type_name: "CheckBox", name: "Mature", value: "mature", state: false },
                    { type_name: "CheckBox", name: "Mecha", value: "mecha", state: false },
                    { type_name: "CheckBox", name: "Military", value: "military", state: false },
                    { type_name: "CheckBox", name: "Modern Life", value: "modern-life", state: false },
                    { type_name: "CheckBox", name: "Mystery", value: "mystery", state: false },
                    { type_name: "CheckBox", name: "Psychological", value: "psychological", state: false },
                    { type_name: "CheckBox", name: "Reincarnation", value: "reincarnation", state: false },
                    { type_name: "CheckBox", name: "Romance", value: "romance", state: false },
                    { type_name: "CheckBox", name: "School Life", value: "school-life", state: false },
                    { type_name: "CheckBox", name: "Sci-fi", value: "sci-fi", state: false },
                    { type_name: "CheckBox", name: "Seinen", value: "seinen", state: false },
                    { type_name: "CheckBox", name: "Shoujo", value: "shoujo", state: false },
                    { type_name: "CheckBox", name: "Shoujo Ai", value: "shoujo-ai", state: false },
                    { type_name: "CheckBox", name: "Shounen", value: "shounen", state: false },
                    { type_name: "CheckBox", name: "Shounen Ai", value: "shounen-ai", state: false },
                    { type_name: "CheckBox", name: "Slice of Life", value: "slice-of-life", state: false },
                    { type_name: "CheckBox", name: "Smut", value: "smut", state: false },
                    { type_name: "CheckBox", name: "Sports", value: "sports", state: false },
                    { type_name: "CheckBox", name: "Supernatural", value: "supernatural", state: false },
                    { type_name: "CheckBox", name: "System", value: "system", state: false },
                    { type_name: "CheckBox", name: "Tragedy", value: "tragedy", state: false },
                    { type_name: "CheckBox", name: "Urban", value: "urban", state: false },
                    { type_name: "CheckBox", name: "Wuxia", value: "wuxia", state: false },
                    { type_name: "CheckBox", name: "Xianxia", value: "xianxia", state: false },
                    { type_name: "CheckBox", name: "Xuanhuan", value: "xuanhuan", state: false },
                    { type_name: "CheckBox", name: "Yaoi", value: "yaoi", state: false },
                    { type_name: "CheckBox", name: "Yuri", value: "yuri", state: false }
                ]
            },
            {
                type_name: "GroupFilter",
                name: "Excluded Genres",
                state: [
                    { type_name: "CheckBox", name: "Action", value: "action", state: false },
                    { type_name: "CheckBox", name: "Adult", value: "adult", state: false },
                    { type_name: "CheckBox", name: "Adventure", value: "adventure", state: false },
                    { type_name: "CheckBox", name: "Comedy", value: "comedy", state: false },
                    { type_name: "CheckBox", name: "Drama", value: "drama", state: false },
                    { type_name: "CheckBox", name: "Eastern", value: "eastern", state: false },
                    { type_name: "CheckBox", name: "Ecchi", value: "ecchi", state: false },
                    { type_name: "CheckBox", name: "Fan-Fiction", value: "fan-fiction", state: false },
                    { type_name: "CheckBox", name: "Fantasy", value: "fantasy", state: false },
                    { type_name: "CheckBox", name: "Game", value: "game", state: false },
                    { type_name: "CheckBox", name: "Gender Bender", value: "gender-bender", state: false },
                    { type_name: "CheckBox", name: "Harem", value: "harem", state: false },
                    { type_name: "CheckBox", name: "Historical", value: "historical", state: false },
                    { type_name: "CheckBox", name: "Horror", value: "horror", state: false },
                    { type_name: "CheckBox", name: "Josei", value: "josei", state: false },
                    { type_name: "CheckBox", name: "Martial Arts", value: "martial-arts", state: false },
                    { type_name: "CheckBox", name: "Mature", value: "mature", state: false },
                    { type_name: "CheckBox", name: "Mecha", value: "mecha", state: false },
                    { type_name: "CheckBox", name: "Military", value: "military", state: false },
                    { type_name: "CheckBox", name: "Modern Life", value: "modern-life", state: false },
                    { type_name: "CheckBox", name: "Mystery", value: "mystery", state: false },
                    { type_name: "CheckBox", name: "Psychological", value: "psychological", state: false },
                    { type_name: "CheckBox", name: "Reincarnation", value: "reincarnation", state: false },
                    { type_name: "CheckBox", name: "Romance", value: "romance", state: false },
                    { type_name: "CheckBox", name: "School Life", value: "school-life", state: false },
                    { type_name: "CheckBox", name: "Sci-fi", value: "sci-fi", state: false },
                    { type_name: "CheckBox", name: "Seinen", value: "seinen", state: false },
                    { type_name: "CheckBox", name: "Shoujo", value: "shoujo", state: false },
                    { type_name: "CheckBox", name: "Shoujo Ai", value: "shoujo-ai", state: false },
                    { type_name: "CheckBox", name: "Shounen", value: "shounen", state: false },
                    { type_name: "CheckBox", name: "Shounen Ai", value: "shounen-ai", state: false },
                    { type_name: "CheckBox", name: "Slice of Life", value: "slice-of-life", state: false },
                    { type_name: "CheckBox", name: "Smut", value: "smut", state: false },
                    { type_name: "CheckBox", name: "Sports", value: "sports", state: false },
                    { type_name: "CheckBox", name: "Supernatural", value: "supernatural", state: false },
                    { type_name: "CheckBox", name: "System", value: "system", state: false },
                    { type_name: "CheckBox", name: "Tragedy", value: "tragedy", state: false },
                    { type_name: "CheckBox", name: "Urban", value: "urban", state: false },
                    { type_name: "CheckBox", name: "Wuxia", value: "wuxia", state: false },
                    { type_name: "CheckBox", name: "Xianxia", value: "xianxia", state: false },
                    { type_name: "CheckBox", name: "Xuanhuan", value: "xuanhuan", state: false },
                    { type_name: "CheckBox", name: "Yaoi", value: "yaoi", state: false },
                    { type_name: "CheckBox", name: "Yuri", value: "yuri", state: false }
                ]
            }
        ];
    }
    
    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }

    async getRelated(url) {
        return await this.getRecommended(url);
    }
    
    async getRecommended(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        
        // Extract novel ID
        const idMatch = res.body.match(/"mangaHsid":"([^"]+)"/) || res.body.match(/"initialManga":\{"id":"([^"]+)"/);
        const bookList = [];
        
        if (idMatch && idMatch[1]) {
            const novelId = idMatch[1];
            try {
                const apiRes = await client.get(`https://api.novelbuddy.me/recommendations/${novelId}`, this.getHeaders(url));
                const apiJson = JSON.parse(apiRes.body);
                
                if (apiJson && apiJson.data) {
                    for (const item of apiJson.data) {
                        const linkUrl = item.url ? item.url : `/${item.slug}`;
                        bookList.push({
                            'name': item.name || item.title || item.t,
                            'link': `${this.source.baseUrl}${linkUrl}`,
                            'imageUrl': item.cover ? (item.cover.startsWith('http') ? item.cover : `${this.source.baseUrl}${item.cover}`) : ""
                        });
                    }
                }
            } catch (e) {
                console.log("Recommended API Error: " + e);
            }
        }
        
        return {
            'list': bookList,
            'hasNextPage': false
        };
    }
}
