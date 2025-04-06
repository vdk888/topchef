import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import RestaurantMap from "@/components/restaurant-map";
import Header from "@/components/header";
import { Restaurant } from "@shared/schema";

const Home = () => {
  const [selectedCountry, setSelectedCountry] = useState<string>("France");
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("May 15, 2024");
  const { toast } = useToast();

  // Fetch restaurants by country
  const { data: restaurants = [], isLoading, refetch } = useQuery<Restaurant[]>({
    queryKey: ['/api/restaurants', selectedCountry],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants?country=${selectedCountry}`);
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Handle country change
  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedRestaurant(null);
  };

  // Handle restaurant selection
  const handleSelectRestaurant = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
  };

  // Handle data update
  const handleUpdateData = async () => {
    try {
      await refetch();
      const now = new Date();
      const formattedDate = `${now.toLocaleString('default', { month: 'short' })} ${now.getDate()}, ${now.getFullYear()}`;
      setLastUpdated(formattedDate);
      toast({
        title: "Success",
        description: "Database updated with latest Top Chef restaurant information!",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update restaurant data",
        variant: "destructive",
      });
    }
  };

  // Get all available countries
  const { data: countries = [] } = useQuery<string[]>({
    queryKey: ['/api/countries'],
    queryFn: async () => {
      const res = await fetch('/api/countries');
      if (!res.ok) throw new Error('Failed to fetch countries');
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Initial data load
  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="h-screen flex flex-col">
      <Header 
        countries={countries}
        selectedCountry={selectedCountry}
        onCountryChange={handleCountryChange}
        onUpdateData={handleUpdateData}
        lastUpdated={lastUpdated}
      />
      <RestaurantMap 
        restaurants={restaurants} 
        selectedCountry={selectedCountry}
        selectedRestaurant={selectedRestaurant}
        onSelectRestaurant={handleSelectRestaurant}
        isLoading={isLoading}
      />
    </div>
  );
};

export default Home;
