import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const articles = [
{
  id: 1,
  slug: 'commander-deckbuilding-guide',
  title: "Building Your First Commander Deck: Turning an Idea into a 100-Card Strategy",
  category: "Magic: The Gathering",
  excerpt: "Commander is one of the most popular formats in Magic: The Gathering. Learn how to build a deck around your commander and create a strategy that reflects you.",
  image: "https://cards.scryfall.io/art_crop/front/5/4/54e3c5b8-6f1b-4a63-bb7e-6d64a0c7d2c5.jpg",
  content: "Commander is one of the most popular formats in Magic: The Gathering, and for good reason. The format encourages creativity, multiplayer interaction, and memorable plays that rarely happen in more competitive formats..."
},
{
  id: 2,
  slug: 'choosing-the-right-commander',
  title: "Choosing the Right Commander: The Heart of Every Deck",
  category: "Magic: The Gathering",
  excerpt: "Your commander is the most important card in your deck. Learn how to choose a commander that matches your playstyle and inspires your creativity.",
  image: "https://cards.scryfall.io/art_crop/front/a/4/a45c3f08-0c9a-4c4e-9d4c-bc5df8e5b4b2.jpg",
  content: "In Commander, the most important card in your deck is the one that begins outside of it: your commander..."
},
{
  id: 3,
  slug: 'commander-table-etiquette',
  title: "Commander Table Etiquette: Winning Isn't the Only Goal",
  category: "Magic: The Gathering",
  excerpt: "Commander is a social format. Learn the etiquette and habits that make for great multiplayer games and positive table experiences.",
  image: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Magic_the_Gathering_players.jpg",
  content: "Commander has always been known as a social format. While winning is certainly satisfying, the format thrives on interaction between players..."
},
{
  id: 4,
  slug: 'gaming-hygiene-and-community',
  title: "Hygiene and the Magic Community: The Topic Nobody Talks About (But Should)",
  category: "Magic: The Gathering",
  excerpt: "Good hygiene creates a welcoming play environment. Learn how simple habits make a big difference in the Magic community.",
  image: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Magic_the_Gathering_tournament.jpg",
  content: "Good hygiene may seem like an unusual topic for a Magic: The Gathering article, but it's actually an important part of maintaining a welcoming play environment..."
}];


export default function ArticleSection() {
  return (
    <section className="py-16 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-6xl mx-auto px-4">

        <div className="text-center mb-12">
          

          
          

          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {articles.map((article) =>
          <article
            key={article.id}
            className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-200 flex flex-col h-full">
            

              <div className="h-48 bg-black overflow-hidden">

                <img
                src={article.image}
                alt={article.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.target.src =
                  "https://cards.scryfall.io/large/front/0/0/00000000-0000-0000-0000-000000000000.jpg";
                }} />
              

              </div>

              <div className="p-6 flex flex-col flex-1">

                <div className="mb-3">
                  <span className="inline-block text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">
                    {article.category}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-3 line-clamp-3">
                  {article.title}
                </h3>

                <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                  {article.excerpt}
                </p>

                <Link
                to={createPageUrl('Article') + `?id=${article.slug}`}
                className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center group">
                

                  Read More

                  <svg
                  className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor">
                  
                    <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7" />
                  
                  </svg>

                </Link>

              </div>

            </article>
          )}

        </div>

      </div>
    </section>);

}