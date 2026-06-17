import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const articles = {
  'commander-deckbuilding-guide': {
    id: 1,
    title: "Building Your First Commander Deck: Turning an Idea into a 100-Card Strategy",
    category: "Magic: The Gathering",
    image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=400&fit=crop",
    content: "Commander is one of the most popular formats in Magic: The Gathering, and for good reason. The format encourages creativity, multiplayer interaction, and memorable plays that rarely happen in more competitive formats. Instead of building a streamlined 60-card deck, Commander challenges players to construct a 100-card singleton deck built around a legendary creature.\n\nFor many players, the deckbuilding process begins with a simple idea. Maybe you want to build around a favorite creature type, create massive battlefield swings, or generate absurd amounts of mana. Whatever the goal, your commander becomes the centerpiece of the entire strategy.\n\nA strong Commander deck usually starts with a balanced foundation. Mana ramp is essential because Commander games often go long, and the ability to accelerate your mana lets you cast larger spells earlier in the game. Cards that draw additional cards are just as important, ensuring that you always have options available.\n\nInteraction also plays a major role in multiplayer games. Removal spells, board wipes, and utility cards help keep opponents from getting too far ahead. Without these tools, even the most powerful strategy can fall apart when another player gains momentum.\n\nOnce the core of the deck is established, the rest of the deck can focus on synergy. This is where the personality of the deck truly shines. Some Commander decks create armies of tokens, others reanimate creatures from the graveyard, and some assemble intricate combos that can end the game instantly.\n\nThe best Commander decks are rarely perfect from the start. Instead, they evolve over time as players refine their card choices and strategies through real gameplay. Each game provides new insight, and each adjustment helps shape the deck into something uniquely personal.\n\nCommander isn't just about building a deck—it's about building a strategy that reflects the player behind it."
  },
  'choosing-the-right-commander': {
    id: 2,
    title: "Choosing the Right Commander: The Heart of Every Deck",
    category: "Magic: The Gathering",
    image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=400&fit=crop",
    content: "In Commander, the most important card in your deck is the one that begins outside of it: your commander.\n\nUnlike most formats in Magic, Commander decks revolve around a legendary creature or artifact that sits in the command zone, ready to be cast throughout the game. This card determines the deck's color identity and often defines the entire strategy of the deck.\n\nFor many players, choosing a commander begins with playstyle. Some players enjoy aggressive strategies that overwhelm opponents with creatures. Others prefer slower, more calculated control decks that manipulate the game until the perfect moment to strike. There are also combo-focused players who enjoy assembling powerful interactions between cards.\n\nColor identity also plays a significant role in shaping a deck. Each color in Magic offers different strengths and strategic possibilities. Green excels at ramping mana and playing large creatures. Blue focuses on card advantage and control. Black interacts heavily with the graveyard, red thrives on explosive damage, and white often emphasizes protection and structure.\n\nMany commanders combine two or more colors, allowing players to mix these strategies together. This flexibility is one of the reasons Commander deckbuilding can be so rewarding.\n\nAnother consideration is complexity. Some commanders offer simple, straightforward abilities that are easy for new players to build around. Others require deeper knowledge of the game's mechanics and reward careful deck construction.\n\nUltimately, the best commander is the one that inspires you to build and play. When you're excited about the card leading your deck, the entire process becomes more engaging."
  },
  'commander-table-etiquette': {
    id: 3,
    title: "Commander Table Etiquette: Winning Isn't the Only Goal",
    category: "Magic: The Gathering",
    image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=400&fit=crop",
    content: "Commander has always been known as a social format. While winning is certainly satisfying, the format thrives on interaction between players and the shared experience of the game itself.\n\nBecause of this, etiquette is an important part of any Commander table.\n\nOne of the most important habits is clear communication. Commander games can involve complicated board states, triggered abilities, and multiple interactions happening at once. Announcing triggers, explaining card effects, and being transparent about your plays helps avoid confusion and keeps the game moving smoothly.\n\nPacing is another important factor. Commander games can already last a long time, especially with four players involved. Thinking through your decisions is part of the game, but excessively long turns can slow down the entire table. Experienced players often plan their turns during other players' turns to keep the game flowing.\n\nPower level is another common topic within Commander groups. Decks can vary dramatically in strength, from casual kitchen-table builds to highly optimized competitive decks. A quick discussion before the game begins helps ensure everyone is bringing decks with similar expectations.\n\nFinally, good sportsmanship makes a huge difference. Being targeted by removal or attacks can sometimes feel frustrating, but it often means your board state is strong enough to worry your opponents. Taking those moments in stride helps maintain a positive environment for everyone.\n\nCommander works best when players remember that the goal isn't just to win—it's to enjoy the game together."
  },
  'gaming-hygiene-and-community': {
    id: 4,
    title: "Hygiene and the Magic Community: The Topic Nobody Talks About (But Should)",
    category: "Magic: The Gathering",
    image: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=400&fit=crop",
    content: "Good hygiene may seem like an unusual topic for a Magic: The Gathering article, but it's actually an important part of maintaining a welcoming play environment.\n\nCommander nights at local game stores, tournaments, and community gatherings often involve players spending several hours together in close spaces. In those environments, basic cleanliness goes a long way toward making sure everyone enjoys the experience.\n\nSimple habits can make a big difference. Taking a shower before heading to a game night, wearing clean clothes, and using deodorant are easy steps that show consideration for other players. Maintaining oral hygiene and washing your hands regularly also helps create a more comfortable environment.\n\nLong events can make this even more important. Tournaments or extended Commander nights can last an entire day. Bringing small items like deodorant, breath mints, or hand sanitizer can help players stay fresh throughout the event.\n\nCleanliness also applies to the play area. Keeping food away from cards, cleaning playmats, and disposing of trash properly helps protect cards and maintain an organized gaming space.\n\nLocal game stores work hard to build communities where players feel welcome. When everyone contributes to a clean and respectful environment, those communities become stronger and more enjoyable for everyone involved.\n\nSometimes the simplest habits are the ones that make the biggest difference."
  }
};

export default function Article() {
  const [searchParams] = useSearchParams();
  const articleId = searchParams.get('id') || 'commander-deckbuilding-guide';
  const article = articles[articleId];

  if (!article) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Link to={createPageUrl('Home')} className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Articles
          </Link>
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900">Article not found</h1>
            <p className="text-gray-600 mt-2">The article you're looking for doesn't exist.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <Link to={createPageUrl('Home')} className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>

        <article className="prose prose-lg max-w-none">
          <div className="mb-8">
            <img 
              src={article.image} 
              alt={article.title}
              className="w-full h-96 object-cover rounded-xl mb-8"
            />
            <div className="mb-4">
              <span className="inline-block text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full uppercase mb-4">
                {article.category}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {article.title}
            </h1>
          </div>

          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {article.content}
          </div>
        </article>
      </div>
    </div>
  );
}