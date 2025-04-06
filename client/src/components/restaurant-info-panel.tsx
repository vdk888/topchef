import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Info } from "lucide-react";
import { Restaurant } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

// Define the ExtendedRestaurant interface for frontend use
interface ExtendedRestaurant extends Restaurant {
  chefName?: string;
  season?: number;
}

// Extended restaurant type to include chef information
type RestaurantWithDetails = Restaurant & {
  chef?: {
    id: number;
    name: string;
    bio?: string | null;
    status: string;
  } | null;
  season?: {
    id: number;
    number: number;
    title: string;
    country: string;
  } | null;
};

interface RestaurantInfoPanelProps {
  restaurant: ExtendedRestaurant;
  selectedCountry: string;
  onClose: () => void;
}

const RestaurantInfoPanel = ({ 
  restaurant, 
  selectedCountry, 
  onClose 
}: RestaurantInfoPanelProps) => {
  const [chefInfo, setChefInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showChefInfo, setShowChefInfo] = useState(false);

  const handleGetDirections = () => {
    const { lat, lng, restaurantName } = restaurant;
    // In a production app, this would use the device's maps application
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };
  
  const fetchChefInfo = async () => {
    // Toggle the panel if information is already loaded
    if (chefInfo) {
      setShowChefInfo(!showChefInfo);
      return;
    }

    setIsLoading(true);
    setShowChefInfo(true);
    
    try {
      // Make sure we have the correct information
      const chefName = restaurant.chefName || "";
      const restaurantName = restaurant.restaurantName || "";
      
      const params = new URLSearchParams({
        chefName,
        restaurantName
      });
      
      console.log(`Fetching chef info for: ${chefName} at ${restaurantName}`);
      const response = await fetch(`/api/chef-info?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chef information: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.information) {
        setChefInfo(data.information);
      } else {
        setChefInfo("Chef information currently unavailable. Please try again later.");
      }
    } catch (error) {
      console.error("Error fetching chef information:", error);
      setChefInfo("Unable to fetch chef information at this time. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-lg z-10 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-bold">{restaurant.restaurantName}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <Card className="border-0 shadow-none">
          <CardContent className="p-0">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-500">CHEF</h3>
                <div className="flex items-center">
                  <p className="text-base">{restaurant.chefName}</p>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="ml-1 h-6 w-6" 
                    onClick={fetchChefInfo}
                    disabled={isLoading}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {showChefInfo && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">CHEF INFORMATION</h3>
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 space-y-2">
                      {chefInfo && chefInfo.split('\n\n').map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full mt-2 text-xs"
                    onClick={() => setShowChefInfo(false)}
                  >
                    Hide Info
                  </Button>
                </div>
              )}
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500">TOP CHEF SEASON</h3>
                <p className="text-base">Season {restaurant.season || restaurant.seasonId || "Unknown"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500">LOCATION</h3>
                <p className="text-base">{restaurant.city}, {selectedCountry}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Lat: {Number(restaurant.lat).toFixed(4)}, Lng: {Number(restaurant.lng).toFixed(4)}
                </p>
              </div>
              
              <Button 
                className="w-full bg-primary hover:bg-primary/90 text-white"
                onClick={handleGetDirections}
              >
                Get Directions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RestaurantInfoPanel;
