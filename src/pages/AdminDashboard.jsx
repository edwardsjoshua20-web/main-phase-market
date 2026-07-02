import { Link } from 'react-router-dom';
import { Package, ClipboardList, ArrowRight, Home, Activity } from 'lucide-react';

const tools = [
  {
    title: 'Inventory',
    description: 'Manage card stock, pricing, and product listings.',
    icon: Package,
    href: '/AdminInventory',
    color: 'bg-blue-500'
  },
  {
    title: 'Orders',
    description: 'View and manage customer orders and fulfillment.',
    icon: ClipboardList,
    href: '/AdminOrders',
    color: 'bg-green-500'
  },
  {
    title: 'Operations',
    description: 'See pipeline health, freshness, missing data, and system status in one place.',
    icon: Activity,
    href: '/AdminOperations',
    color: 'bg-purple-500'
  }
];

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <Link to="/" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
            <Home className="w-4 h-4" /> Back to Site
          </Link>
          <h1 className="text-3xl font-bold text-white">Admin Tools</h1>
          <p className="text-gray-400 mt-1">Only the core operational tools are exposed while the rest gets rebuilt cleanly.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                to={tool.href}
                className="group flex items-start gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-2xl p-5 transition-all"
              >
                <div className={`${tool.color} p-3 rounded-xl shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-base">{tool.title}</p>
                  <p className="text-gray-400 text-sm mt-0.5 leading-snug">{tool.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white mt-1 shrink-0 transition-colors" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
