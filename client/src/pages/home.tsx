import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Map, List, Menu } from "lucide-react"; // Import icons for toggle AND Menu icon
import RestaurantMap from "@/components/restaurant-map";
// import RestaurantTable from "@/components/restaurant-table"; // Placeholder for table component
import RestaurantInfoPanel from "@/components/restaurant-info-panel"; 
import Header from "@/components/header";
import { Restaurant, Season, RestaurantWithDetails } from "@shared/schema"; // Import Season type AND the shared RestaurantWithDetails type
import { Button } from "@/components/ui/button"; // Import Button
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"; // Import Sheet components
// Removed incorrect import from ../../server/storage

// Define the type used for state and passed to some components
// Explicitly define it to match RestaurantWithDetails structure
interface ExtendedRestaurant extends Restaurant {
  seasonNumber: number | null;
  chefName: string | null;
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

  // Fetch restaurants by country and selected season
  // Use the correct type RestaurantWithDetails from storage.ts
  const { data: restaurants = [], isLoading, refetch } = useQuery<RestaurantWithDetails[]>({ 
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

      // Refetch data after a delay to allow the server to update the database
      setTimeout(() => {
        // Refetch restaurants
        refetch();
        
        // Refetch seasons to ensure we have the latest season list
        const refetchSeasons = async () => {
          try {
            const res = await fetch(`/api/seasons/country/${selectedCountry}`);
            if (res.ok) {
              const updatedSeasons = await res.json();
              if (updatedSeasons.length > availableSeasons.length) {
                toast({
                  title: "New Seasons Found",
                  description: "New seasons have been discovered and added to the database.",
                  variant: "default",
                });
              }
            }
          } catch (error) {
            console.error("Error refetching seasons:", error);
          }
        };
        refetchSeasons();
      }, 3000); // Refetch after 3 seconds

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
    <div className="h-screen relative"> {/* Removed flex flex-col, added relative */}
      {/* Sidebar Sheet */}
      <Sheet>
        <SheetTrigger asChild>
          {/* Position the trigger button */}
          <Button variant="outline" size="icon" className="absolute top-4 left-4 z-50 bg-white shadow-md">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] sm:w-[350px] z-[100] flex flex-col"> {/* Added flex flex-col */}
          <SheetHeader>
            <SheetTitle>Filters & Options</SheetTitle>
            <SheetDescription>
              Select country, season, and manage data.
            </SheetDescription>
          </SheetHeader>
          {/* Render Header content inside the sheet */}
          <div className="flex-1 overflow-y-auto"> {/* Make content scrollable */}
            <Header 
              countries={countries}
              selectedCountry={selectedCountry}
              onCountryChange={handleCountryChange}
              onUpdateData={handleUpdateData}
              lastUpdated={lastUpdated}
              availableSeasons={availableSeasons} 
              selectedSeasonId={selectedSeasonId}
              onSeasonChange={handleSeasonChange}
            />
          </div>
           {/* Optionally add the view toggle inside the sheet */}
           <div className="mt-auto border-t pt-4"> {/* Push to bottom */}
             <Button 
               variant="secondary" 
               size="sm" 
               className="w-full"
               onClick={() => setViewMode(viewMode === 'map' ? 'table' : 'map')}
             >
               {viewMode === 'map' ? <List className="h-4 w-4 mr-2" /> : <Map className="h-4 w-4 mr-2" />}
               {viewMode === 'map' ? 'Switch to Table View' : 'Switch to Map View'}
             </Button>
           </div>
        </SheetContent>
      </Sheet>
      
      {/* Main Content Area (Map or Table) - Takes full screen */}
      <div className="h-screen overflow-hidden"> {/* Adjusted height and removed relative positioning */}
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
                         <th className="p-1">Chef Name</th> 
                       </tr>
                     </thead>
                     <tbody>
                       {/* Ensure 'r' is typed correctly if needed, but TS should infer from useQuery */}
                       {restaurants.map(r => ( 
                         <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => handleSelectRestaurant(r)}>
                           <td className="p-1">{r.restaurantName}</td>
                           <td className="p-1">{r.city}</td>
                           {/* Render chefName, provide fallback if null */}
                           <td className="p-1">{r.chefName ?? 'N/A'}</td> 
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
      
        {/* Removed the "Select a restaurant" empty state panel */}
        
      </div> {/* Close Main Content Area */}

      {/* Render Info Panel if a restaurant is selected (works for both views) */}
      {/* Keep z-index lower than sheet trigger/content */}
      {selectedRestaurant && (
        <RestaurantInfoPanel
          restaurant={selectedRestaurant}
          onClose={() => handleSelectRestaurant(null)} 
          // Add z-index to ensure it's above map but below sheet
          className="z-30" 
        />
      )}
    </div>
  );
};

export default Home;
