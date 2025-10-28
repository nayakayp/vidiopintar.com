import { transactionsRepository } from "@/lib/db/repository/transactions";
import { UserVideoRepository } from "@/lib/db/repository";

export type UserPlan = "free" | "monthly" | "yearly";

export interface PlanLimits {
  videosPerDay: number;
  unlimited: boolean;
}

const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    videosPerDay: -1, // unlimited
    unlimited: true,
  },
  monthly: {
    videosPerDay: -1, // unlimited
    unlimited: true,
  },
  yearly: {
    videosPerDay: -1, // unlimited
    unlimited: true,
  },
};

export class UserPlanService {
  /**
   * Get user's current active plan
   */
  static async getCurrentPlan(userId: string): Promise<UserPlan> {
    // Check for active subscription transactions
    const confirmedTransaction =
      await transactionsRepository.getRecentTransactionsByUserId(
        userId,
        365 * 24 * 60 * 60 * 1000, // 365 days in milliseconds to cover yearly plans
      );

    // Find the most recent confirmed transaction within subscription period
    const activeTransaction = confirmedTransaction.find((tx) => {
      if (tx.status !== "confirmed" || !tx.confirmedAt) return false;

      const confirmedDate = new Date(tx.confirmedAt);
      const now = new Date();

      // Check if subscription is still active based on plan type
      if (tx.planType === "monthly") {
        const expiry = new Date(
          confirmedDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        ); // 30 days
        return now <= expiry;
      } else if (tx.planType === "yearly") {
        const expiry = new Date(
          confirmedDate.getTime() + 365 * 24 * 60 * 60 * 1000,
        ); // 365 days
        return now <= expiry;
      }

      return false;
    });

    if (activeTransaction) {
      return activeTransaction.planType as UserPlan;
    }

    return "free";
  }

  /**
   * Get plan limits for a specific plan
   */
  static getPlanLimits(plan: UserPlan): PlanLimits {
    return PLAN_LIMITS[plan];
  }

  /**
   * Check if user can add a new video based on their plan limits
   */
  static async canAddVideo(userId: string): Promise<{
    canAdd: boolean;
    currentPlan: UserPlan;
    reason?: string;
    videosUsedToday?: number;
    dailyLimit?: number;
  }> {
    const currentPlan = await this.getCurrentPlan(userId);
    const limits = this.getPlanLimits(currentPlan);

    // If plan has unlimited videos, always allow
    if (limits.unlimited) {
      return {
        canAdd: true,
        currentPlan,
      };
    }

    // For free plan, check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Count videos added today
    const userVideos = await UserVideoRepository.getAllByUser(userId);
    const videosToday = userVideos.filter((video) => {
      const videoDate = new Date(video.createdAt);
      return videoDate >= today && videoDate < tomorrow;
    });

    const videosUsedToday = videosToday.length;
    const dailyLimit = limits.videosPerDay;

    if (videosUsedToday >= dailyLimit) {
      return {
        canAdd: false,
        currentPlan,
        reason: "daily_limit_reached",
        videosUsedToday,
        dailyLimit,
      };
    }

    return {
      canAdd: true,
      currentPlan,
      videosUsedToday,
      dailyLimit,
    };
  }

  /**
   * Get user's current usage stats
   */
  static async getUserUsageStats(userId: string) {
    const currentPlan = await this.getCurrentPlan(userId);
    const limits = this.getPlanLimits(currentPlan);

    if (limits.unlimited) {
      return {
        currentPlan,
        unlimited: true,
        videosUsedToday: 0,
        dailyLimit: -1,
      };
    }

    // Count videos added today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const userVideos = await UserVideoRepository.getAllByUser(userId);
    const videosToday = userVideos.filter((video) => {
      const videoDate = new Date(video.createdAt);
      return videoDate >= today && videoDate < tomorrow;
    });

    return {
      currentPlan,
      unlimited: false,
      videosUsedToday: videosToday.length,
      dailyLimit: limits.videosPerDay,
    };
  }

  /**
   * Check if user has an active subscription for a specific plan type
   */
  static async hasActiveSubscription(
    userId: string,
    planType: UserPlan,
  ): Promise<{
    hasActive: boolean;
    expiresAt?: Date;
    transaction?: any;
  }> {
    if (planType === "free") {
      return { hasActive: false };
    }

    // Get recent transactions to check for active subscriptions
    const recentTransactions =
      await transactionsRepository.getRecentTransactionsByUserId(
        userId,
        365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds to cover yearly plans
      );

    // Find active subscription for the specific plan type
    const activeTransaction = recentTransactions.find((tx) => {
      if (
        tx.status !== "confirmed" ||
        !tx.confirmedAt ||
        tx.planType !== planType
      )
        return false;

      const confirmedDate = new Date(tx.confirmedAt);
      const now = new Date();

      // Check if subscription is still active based on plan type
      if (tx.planType === "monthly") {
        const expiry = new Date(
          confirmedDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        ); // 30 days
        return now <= expiry;
      } else if (tx.planType === "yearly") {
        const expiry = new Date(
          confirmedDate.getTime() + 365 * 24 * 60 * 60 * 1000,
        ); // 365 days
        return now <= expiry;
      }

      return false;
    });

    if (activeTransaction) {
      const confirmedDate = new Date(activeTransaction.confirmedAt!);
      const expiresAt =
        activeTransaction.planType === "monthly"
          ? new Date(confirmedDate.getTime() + 30 * 24 * 60 * 60 * 1000)
          : new Date(confirmedDate.getTime() + 365 * 24 * 60 * 60 * 1000);

      return {
        hasActive: true,
        expiresAt,
        transaction: activeTransaction,
      };
    }

    return { hasActive: false };
  }

  /**
   * Check if user can purchase a specific plan
   */
  static async canPurchasePlan(
    userId: string,
    planType: UserPlan,
  ): Promise<{
    canPurchase: boolean;
    reason?: string;
    activeSubscription?: {
      planType: UserPlan;
      expiresAt: Date;
    };
  }> {
    if (planType === "free") {
      return { canPurchase: false, reason: "free_plan_cannot_be_purchased" };
    }

    const activeSubscriptionCheck = await this.hasActiveSubscription(
      userId,
      planType,
    );

    if (activeSubscriptionCheck.hasActive) {
      return {
        canPurchase: false,
        reason: "already_have_active_subscription",
        activeSubscription: {
          planType,
          expiresAt: activeSubscriptionCheck.expiresAt!,
        },
      };
    }

    return { canPurchase: true };
  }
}
