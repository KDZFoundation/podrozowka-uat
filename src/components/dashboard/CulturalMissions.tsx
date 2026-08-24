import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Medal, Globe, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";

const CulturalMissions = () => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["cultural-missions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const stats = await firestoreService.getTravelerStats(user!.id);
      return {
        totalRegistered: stats.registeredRelations,
        uniqueCountries: stats.uniqueCountries,
      };
    },
  });


  const totalRegistered = data?.totalRegistered ?? 0;
  const uniqueCountries = data?.uniqueCountries ?? 0;

  const missions = [
    {
      icon: Medal,
      title: "Pierwszy Krok",
      description: "Zarejestruj swoją pierwszą kartkę",
      current: Math.min(totalRegistered, 1),
      goal: 1,
    },
    {
      icon: Globe,
      title: "Obywatel Świata",
      description: "Dotrzyj do 3 różnych krajów",
      current: Math.min(uniqueCountries, 3),
      goal: 3,
    },
    {
      icon: Trophy,
      title: "Wpływowy Ambasador",
      description: "Zarejestruj łącznie 10 kartek",
      current: Math.min(totalRegistered, 10),
      goal: 10,
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Misje Kulturowe</h3>
      {missions.map((m) => {
        const pct = Math.round((m.current / m.goal) * 100);
        const completed = pct >= 100;
        const Icon = m.icon;
        return (
          <Card key={m.title}>
            <CardContent className="flex items-center gap-4 p-4">
              <Icon
                className={`h-8 w-8 shrink-0 ${completed ? "text-yellow-500" : "text-muted-foreground"}`}
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.current}/{m.goal}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{m.description}</p>
                <Progress value={pct} className="h-2" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default CulturalMissions;
