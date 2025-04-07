import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Map, List } from "lucide-react"; // Import icons for toggle
import RestaurantMap from "@/components/restaurant-map";
// import RestaurantTable from "@/components/restaurant-table"; // Placeholder for table component
import RestaurantInfoPanel from "@/components/restaurant-info-panel"; 
import Header from "@/components/header";
import { Restaurant, Season } from "@shared/schema"; // Import Season type
import { Button } from "@/components/ui/button"; // Import Button

// Extended Restaurant interface with additional fields needed in the frontend
interface ExtendedRestaurant extends Restaurant {
  chefName?: string;
  season?: number;
}

type ViewMode = 'map' | 'table';

const Home = () => {
  const [selectedCountry, setSelectedCountry] = useState<string>("France");
  const [selectedRestaurant, setSelectedRestaurant] = useState<ExtendedRestaurant | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null); // State for season filter
  const [lastUpdated, setLastUpdated] = useState<string>("May 15, 2024"); // TODO: Get initial value dynamically?
  const [viewMode, setViewMode] = useState<ViewMode>('map'); 
  const { toast } = useToast();

  // Fetch available seasons for the selected country
  const { data: availableSeasons = [] } = useQuery<Season[]>({
    queryKey: ['/api/seasons/country', selectedCountry],
    queryFn: async () => {
      const res = await fetch(`/api/seasons/country/${selectedCountry}`);
      if (!res.ok) throw new Error('Failed to fetch seasons');
      return res.json();
    },
    enabled: !!selectedCountry, // Only run if a country is selected
    refetchOnWindowFocus: false,
  });

  // Define the extended type for restaurants query result
  type RestaurantWithSeasonNumber = Restaurant & { seasonNumber: number | null };

  // Fetch restaurants by country and selected season
  const { data: restaurants = [], isLoading, refetch } = useQuery<RestaurantWithSeasonNumber[]>({ // Use updated type
    // Include selectedSeasonId in the query key to trigger refetch on change
    queryKey: ['/api/restaurants', selectedCountry, selectedSeasonId], 
    queryFn: async () => {
      let url = `/api/restaurants?country=${selectedCountry}`;
      if (selectedSeasonId !== null) {
        url += `&season=${selectedSeasonId}`; // Add season query param if selected
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Handle country change
  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedRestaurant(null); 
    setSelectedSeasonId(null); // Reset season filter when country changes
  };

  // Handle season change
  const handleSeasonChange = (seasonId: number | null) => {
    setSelectedSeasonId(seasonId);
    setSelectedRestaurant(null); // Clear selection when season changes
  };

  // Handle restaurant selection (from map or table)
  const handleSelectRestaurant = (restaurant: ExtendedRestaurant | null) => {
    setSelectedRestaurant(restaurant);
  };

  // Handle data update - Calls the backend update endpoint
  const handleUpdateData = async () => {
    toast({
      title: "Update Started",
      description: `Initiating data update process for ${selectedCountry}...`,
      variant: "default",
    });
    try {
      const response = await fetch('/api/update-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ country: selectedCountry }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to initiate update process');
      }

      // Update last updated time locally (consider getting this from backend response later)
      const now = new Date();
      const formattedDate = `${now.toLocaleString('default', { month: 'short' })} ${now.getDate()}, ${now.getFullYear()}`;
      setLastUpdated(formattedDate);

      toast({
        title: "Update In Progress",
        description: result.message || `Update process for ${selectedCountry} started successfully.`,
        variant: "default",
      });

      // Optionally refetch data after a delay or based on backend signal
      // For now, we just show the message. The update happens server-side.
      // Consider adding a mechanism to notify completion and then refetch.
      // setTimeout(() => refetch(), 5000); // Example: Refetch after 5 seconds

    } catch (error) {
      console.error("Error triggering update process:", error);
      toast({
        title: "Update Error",
        description: error instanceof Error ? error.message : "Failed to start update process",
        variant: "destructive",
      });
    }
  };

  // Get all available countries for the dropdown
  const { data: countries = [] } = useQuery<string[]>({
    queryKey: ['/api/countries'],
    queryFn: async () => {
      const res = await fetch('/api/countries');
      if (!res.ok) throw new Error('Failed to fetch countries');
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Initial data load for the default country
  useEffect(() => {
    refetch();
  }, [refetch]); // refetch is stable, this runs once on mount

  return (
    <div className="h-screen flex flex-col">
      <Header 
        countries={countries}
        selectedCountry={selectedCountry}
        onCountryChange={handleCountryChange}
        onUpdateData={handleUpdateData}
        lastUpdated={lastUpdated}
        // Pass season filter props
        availableSeasons={availableSeasons} 
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={handleSeasonChange}
      />
      
      {/* View Mode Toggle Button */}
      <div className="p-2 flex justify-end border-b"> {/* Added border */}
         <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'map' ? 'table' : 'map')}>
           {viewMode === 'map' ? <List className="h-4 w-4 mr-2" /> : <Map className="h-4 w-4 mr-2" />}
           {viewMode === 'map' ? 'Show Table' : 'Show Map'}
         </Button>
      </div>

      {/* Main Content Area (Map or Table) */}
      <div className="flex-1 overflow-hidden relative"> {/* Added relative positioning */}
        {viewMode === 'map' ? (
          <RestaurantMap 
            restaurants={restaurants} 
            selectedCountry={selectedCountry} // Pass country for map centering/zoom logic
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={handleSelectRestaurant}
            isLoading={isLoading}
          />
        ) : (
          // Placeholder for RestaurantTable component
          <div className="p-4 h-full overflow-y-auto"> {/* Added scroll */}
            <h2 className="text-xl font-semibold mb-4">Restaurant Table (Placeholder)</h2>
            {isLoading ? <p>Loading...</p> : 
              restaurants.length > 0 ? (
                <div className="text-xs bg-gray-100 p-2 rounded overflow-auto border">
                  {/* Basic table structure example */}
                  <table className="w-full">
                     <thead>
                       <tr className="text-left border-b">
                         <th className="p-1">Name</th>
                         <th className="p-1">City</th>
                         <th className="p-1">Chef ID</th> 
                       </tr>
                     </thead>
                     <tbody>
                       {restaurants.map(r => (
                         <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectRestaurant(r)}>
                           <td className="p-1">{r.restaurantName}</td>
                           <td className="p-1">{r.city}</td>
                           <td className="p-1">{r.chefId}</td>
                         </tr>
                       ))}
                     </tbody>
                  </table>
                </div>
              ) : <p>No restaurants found for {selectedCountry}.</p>
            }
          </div>
          // <RestaurantTable restaurants={restaurants} isLoading={isLoading} onSelectRestaurant={handleSelectRestaurant} /> 
        )}
      
        {/* Info Panel / Empty State for Map View */}
        {/* This empty state only makes sense for the map view */}
        {!selectedRestaurant && viewMode === 'map' && restaurants.length > 0 && !isLoading && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white shadow-lg rounded-t-lg transform transition-transform duration-300 ease-in-out z-20"> 
            <div className="text-center p-4">
              <div className="flex justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-base font-medium text-gray-900">Select a restaurant</h3>
              <p className="mt-1 text-sm text-gray-500">Tap on a marker to view restaurant details</p>
            </div>
          </div>
        )}
      </div> {/* Close Main Content Area */}

      {/* Render Info Panel if a restaurant is selected (works for both views) */}
      {selectedRestaurant && (
        <RestaurantInfoPanel
          restaurant={selectedRestaurant}
          onClose={() => handleSelectRestaurant(null)} 
        />
      )}
    </div>
  );
};

export default Home;
