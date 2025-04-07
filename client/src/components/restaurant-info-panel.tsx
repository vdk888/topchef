import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Calendar, Database, Zap, MapPin } from "lucide-react"; // Added Database, Zap, MapPin icons
import { Restaurant, Chef, Season } from "@shared/schema"; // Import Chef, Season
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Added Tooltip
import { format } from 'date-fns'; // For formatting dates

// Type for the detailed data fetched from the new panel endpoint
type PanelData = Restaurant & {
  chef: Chef | null;
  season: Season | null;
  metadata: { // Metadata about data origin and freshness
    restaurantName: { origin: 'db' | 'live', lastUpdated: Date | null };
    address: { origin: 'db' | 'live', lastUpdated: Date | null };
    chefAssociation: { origin: 'db' | 'live', lastUpdated: Date | null };
    bio: { origin: 'db' | 'live', lastUpdated: Date | null };
    // Add other fields corresponding to metadata object in backend response
  };
};

// Keep ExtendedRestaurant for initial prop type (passed from Home)
interface ExtendedRestaurant extends Restaurant {
  chefName?: string; // May not be needed if panelData always has chef
  season?: number;   // May not be needed if panelData always has season
}

interface RestaurantInfoPanelProps {
  restaurant: ExtendedRestaurant; // Initial basic data used to trigger fetch
  // selectedCountry: string; // Not needed if endpoint only uses ID
  onClose: () => void;
}

// Helper component to display data with origin tooltip
const DataField = ({ label, value, metadata }: { label: string; value: React.ReactNode; metadata?: { origin: 'db' | 'live', lastUpdated: Date | null } }) => {
  if (!value) return null;

  const originIcon = metadata?.origin === 'live' 
    ? <Zap className="h-3 w-3 text-yellow-500" /> 
    : <Database className="h-3 w-3 text-blue-500" />;
  const tooltipText = `${metadata?.origin === 'live' ? 'Live' : 'DB'} | ${metadata?.lastUpdated ? formatDate(metadata.lastUpdated) : 'N/A'}`;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 flex items-center">
        {label}
        {metadata && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1.5 cursor-help">{originIcon}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </h3>
      <div className="text-base mt-0.5">{value}</div>
    </div>
  );
};

// Helper to format date or return 'N/A'
const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  try {
    return format(new Date(date), 'MMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
};

const RestaurantInfoPanel = ({ 
  restaurant, 
  onClose 
}: RestaurantInfoPanelProps) => {
  const [panelData, setPanelData] = useState<PanelData | null>(null); // Use new PanelData type
  const [isLoading, setIsLoading] = useState(true); // Start loading immediately
  const [error, setError] = useState<string | null>(null);

  const handleGetDirections = () => {
    // Use lat/lng from panelData if available and valid, otherwise fallback to initial prop
    const lat = panelData?.lat ?? restaurant.lat;
    const lng = panelData?.lng ?? restaurant.lng;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  // Fetch data from the new panel endpoint
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setPanelData(null); // Clear previous data

      try {
        console.log(`Fetching panel data for restaurant ID: ${restaurant.id}`);
        const response = await fetch(`/api/restaurant-panel-data/${restaurant.id}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to parse error
          throw new Error(errorData.error || `Failed to fetch panel data: ${response.status}`);
        }
        
        const data: PanelData = await response.json();
        
        // Convert date strings from JSON to Date objects (important for date-fns)
        if (data.metadata?.restaurantName?.lastUpdated) data.metadata.restaurantName.lastUpdated = new Date(data.metadata.restaurantName.lastUpdated);
        if (data.metadata?.address?.lastUpdated) data.metadata.address.lastUpdated = new Date(data.metadata.address.lastUpdated);
        if (data.metadata?.chefAssociation?.lastUpdated) data.metadata.chefAssociation.lastUpdated = new Date(data.metadata.chefAssociation.lastUpdated);
        if (data.metadata?.bio?.lastUpdated) data.metadata.bio.lastUpdated = new Date(data.metadata.bio.lastUpdated);
        // Convert other date fields if necessary
        
        setPanelData(data); 

      } catch (err) {
        console.error("Error fetching restaurant panel data:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [restaurant.id]); // Re-fetch when the selected restaurant changes

  // Display loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-sm bg-white shadow-lg z-[60] flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/4 mt-2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-1/4 mt-2" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/4 mt-2" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-10 w-full mt-4" />
      </div>
    );
  }

  // Display error state
  if (error) {
     return (
      <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-sm bg-white shadow-lg z-[60] flex flex-col p-4">
         <div className="flex items-center justify-between border-b pb-3">
           <h2 className="text-lg font-bold text-red-600">Error</h2>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
         </div>
         <p className="text-red-600 mt-4">{error}</p>
      </div>
     );
  }
  
  // Display empty state if no data after loading/no error
  if (!panelData) {
     return (
       <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-sm bg-white shadow-lg z-[60] flex flex-col p-4">
         <div className="flex items-center justify-between border-b pb-3">
           <h2 className="text-lg font-bold">Restaurant Info</h2>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
         </div>
         <p className="mt-4">No data available for this restaurant.</p>
       </div>
     );
  }

  // Render panel with fetched data
  return (
    <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-sm bg-white shadow-lg z-[60] flex flex-col">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-3 border-b">
         {/* Use DataField for the header title */}
         <DataField 
            label="" // No visible label for the main title
            value={<h2 className="text-base font-bold truncate">{panelData.restaurantName}</h2>} 
            metadata={panelData.metadata?.restaurantName} 
         />
        <Button
          variant="ghost" 
          size="icon" 
          className="rounded-full -mr-1" 
          onClick={onClose} 
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        <Card className="border-0 shadow-none">
          <CardContent className="p-0">
            <div className="space-y-4"> {/* Adjusted spacing for mobile */}
              
              <DataField 
                 label="CHEF" 
                 value={panelData.chef?.name || "N/A"} 
                 metadata={panelData.metadata?.chefAssociation} 
              />

              {/* Conditionally render Bio */}
              <DataField 
                 label="BIO" 
                 value={
                    panelData.chef?.bio ? (
                       <div className="text-sm text-gray-700 space-y-2">
                         {panelData.chef.bio.split('\n\n').map((paragraph, index) => (
                           <p key={index}>{paragraph}</p>
                         ))}
                       </div>
                    ) : (
                       <span className="text-sm text-gray-500 italic">Bio not available</span>
                    )
                 } 
                 metadata={panelData.metadata?.bio} 
              />

              {/* Season Info - Restructured for mobile */}
              {panelData.season && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500">TOP CHEF SEASON</h3>
                  <div className="flex items-center mt-0.5">
                    <Calendar className="h-4 w-4 mr-1.5 text-gray-500" />
                    <span className="text-base">
                      Season {panelData.season.number || "Unknown"} ({panelData.season.year})
                    </span>
                  </div>
                </div>
              )}
              
              {/* Location Info */}
              <DataField 
                 label="LOCATION" 
                 value={
                    <>
                      {/* Display address if available, otherwise city/country */}
                      <p>{panelData.address || `${panelData.city}, ${panelData.country}`}</p> 
                      <p className="text-xs text-gray-500 mt-1">
                        Lat: {Number(panelData.lat).toFixed(4)}, Lng: {Number(panelData.lng).toFixed(4)}
                      </p>
                    </>
                 } 
                 metadata={panelData.metadata?.address} 
              />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Fixed button at bottom */}
      <div className="p-3 border-t">
        <Button 
          className="w-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center"
          onClick={handleGetDirections}
        >
          <MapPin className="h-4 w-4 mr-2" />
          Get Directions
        </Button>
      </div>
    </div>
  );
};

export default RestaurantInfoPanel;
