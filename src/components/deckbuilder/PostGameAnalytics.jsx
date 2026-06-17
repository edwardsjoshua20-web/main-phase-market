import React from 'react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RotateCcw, Home } from 'lucide-react';

export default function PostGameAnalytics({ gameStats, onPlayAgain, onExit }) {
  const {
    winner,
    finalPlayerLife,
    finalOpponentLife,
    turns,
    cardsPlayedByPlayer,
    cardsPlayedByOpponent,
    totalDamageDealt,
    totalDamageTaken,
    landPlayed,
    creaturesPlayed,
    spellsPlayed
  } = gameStats;

  const winLossData = [
    { name: 'Player', value: winner === 'player' ? 1 : 0, fill: '#22c55e' },
    { name: 'AI', value: winner === 'opponent' ? 1 : 0, fill: '#ef4444' }
  ];

  const cardTypeData = [
    { name: 'Lands', value: landPlayed, fill: '#8b7355' },
    { name: 'Creatures', value: creaturesPlayed, fill: '#6366f1' },
    { name: 'Spells', value: spellsPlayed, fill: '#f59e0b' }
  ];

  const damageData = [
    { name: 'Dealt', player: totalDamageDealt, opponent: 0 },
    { name: 'Taken', player: 0, opponent: totalDamageTaken }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg border border-purple-500/30 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-purple-500/20 px-8 py-6">
          <div className="text-center">
            <h2 className={`text-4xl font-bold mb-2 ${winner === 'player' ? 'text-green-400' : 'text-red-400'}`}>
              {winner === 'player' ? '🎉 Victory!' : '💀 Defeat'}
            </h2>
            <p className="text-gray-400">Game lasted {turns} turns</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Final Scores */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">Your Life Total</p>
              <p className="text-5xl font-bold text-green-400">{finalPlayerLife}</p>
            </div>
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-2">AI Life Total</p>
              <p className="text-5xl font-bold text-red-400">{finalOpponentLife}</p>
            </div>
          </div>

          {/* Damage Comparison */}
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Combat Summary</h3>
            <div className="bg-gray-800/30 rounded-lg p-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={damageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563' }} />
                  <Legend />
                  <Bar dataKey="player" fill="#22c55e" name="You" />
                  <Bar dataKey="opponent" fill="#ef4444" name="AI" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card Stats */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Your Cards Played</h3>
              <div className="bg-gray-800/30 rounded-lg p-4">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={cardTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {cardTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Game Statistics</h3>
              <div className="bg-gray-800/30 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                  <span className="text-gray-400">Total Cards Played</span>
                  <span className="text-white font-semibold">{cardsPlayedByPlayer}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                  <span className="text-gray-400">Damage Dealt</span>
                  <span className="text-green-400 font-semibold">{totalDamageDealt}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                  <span className="text-gray-400">Damage Taken</span>
                  <span className="text-red-400 font-semibold">{totalDamageTaken}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">AI Cards Played</span>
                  <span className="text-white font-semibold">{cardsPlayedByOpponent}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center pt-6 border-t border-gray-700">
            <Button
              onClick={onPlayAgain}
              className="bg-purple-600 hover:bg-purple-700 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </Button>
            <Button
              onClick={onExit}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700 flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Exit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}