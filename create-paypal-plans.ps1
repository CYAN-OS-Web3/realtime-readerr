# PayPal Sandbox Plan Creator - Cyan Translator
# Chỉnh sửa 3 dòng dưới đây
$clientId = "AepsG-PFt1llmaQzzPIH35qLeFkgVlpoHxgfzLbZWN1HdZHrzrvJjedXszsiSmPUIJT-Bf8kKXhbx40j"
$secret   = "EAjMI6PBhbABpbLTcHJIg-dnNcZTgJx2f78rhB4ad3BingO-179NvYUxjdkTi4YQup8k06fbnc0G2dpg"
$productId = ""  # để trống để tạo mới

# ---- Không sửa dưới đây ----
$basicAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$clientId`:$secret"))

Write-Host "=== 1) Get Access Token ==="
$tokenResp = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/oauth2/token" `
  -Headers @{ Authorization = "Basic $basicAuth"; "Content-Type" = "application/x-www-form-urlencoded" } `
  -Body "grant_type=client_credentials"

$token = $tokenResp.access_token
Write-Host "Token OK"

if (-not $productId -or $productId -eq "PROD-XXXX") {
  Write-Host "`n=== 2) Create Product ==="
  $product = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api-m.sandbox.paypal.com/v1/catalogs/products" `
    -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
    -Body (@{
      name = "Cyan Translator Plans"
      type = "SERVICE"
      category = "SOFTWARE"
    } | ConvertTo-Json)

  $productId = $product.id
  Write-Host "Product ID: $productId"
}

Write-Host "`n=== 3) Create Plans ==="

# Basic $29/month
$basic = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/billing/plans" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body (@{
    product_id = $productId
    name = "Basic Monthly"
    status = "ACTIVE"
    billing_cycles = @(
      @{
        frequency = @{ interval_unit = "MONTH"; interval_count = 1 }
        tenure_type = "REGULAR"
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{ fixed_price = @{ value = "29"; currency_code = "USD" } }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee = @{ value = "0"; currency_code = "USD" }
      setup_fee_failure_action = "CONTINUE"
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 10)
Write-Host "Basic Plan ID: $($basic.id)"

# Standard $59/month
$standard = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/billing/plans" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body (@{
    product_id = $productId
    name = "Standard Monthly"
    status = "ACTIVE"
    billing_cycles = @(
      @{
        frequency = @{ interval_unit = "MONTH"; interval_count = 1 }
        tenure_type = "REGULAR"
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{ fixed_price = @{ value = "59"; currency_code = "USD" } }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee = @{ value = "0"; currency_code = "USD" }
      setup_fee_failure_action = "CONTINUE"
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 10)
Write-Host "Standard Plan ID: $($standard.id)"

# Pro $99/month
$pro = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/billing/plans" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body (@{
    product_id = $productId
    name = "Pro Monthly"
    status = "ACTIVE"
    billing_cycles = @(
      @{
        frequency = @{ interval_unit = "MONTH"; interval_count = 1 }
        tenure_type = "REGULAR"
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{ fixed_price = @{ value = "99"; currency_code = "USD" } }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee = @{ value = "0"; currency_code = "USD" }
      setup_fee_failure_action = "CONTINUE"
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 10)
Write-Host "Pro Plan ID: $($pro.id)"

# Team $299/month
$team = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/billing/plans" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body (@{
    product_id = $productId
    name = "Team Monthly"
    status = "ACTIVE"
    billing_cycles = @(
      @{
        frequency = @{ interval_unit = "MONTH"; interval_count = 1 }
        tenure_type = "REGULAR"
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{ fixed_price = @{ value = "299"; currency_code = "USD" } }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee = @{ value = "0"; currency_code = "USD" }
      setup_fee_failure_action = "CONTINUE"
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 10)
Write-Host "Team Plan ID: $($team.id)"

# Executive $699/year
$executive = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api-m.sandbox.paypal.com/v1/billing/plans" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body (@{
    product_id = $productId
    name = "Executive Annual"
    status = "ACTIVE"
    billing_cycles = @(
      @{
        frequency = @{ interval_unit = "YEAR"; interval_count = 1 }
        tenure_type = "REGULAR"
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{ fixed_price = @{ value = "699"; currency_code = "USD" } }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee = @{ value = "0"; currency_code = "USD" }
      setup_fee_failure_action = "CONTINUE"
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 10)
Write-Host "Executive Plan ID: $($executive.id)"

Write-Host "`n=== Kết quả ==="
Write-Host "PAYPAL_PLAN_ID_BASIC=$($basic.id)"
Write-Host "PAYPAL_PLAN_ID_STANDARD=$($standard.id)"
Write-Host "PAYPAL_PLAN_ID_PRO=$($pro.id)"
Write-Host "PAYPAL_PLAN_ID_TEAM=$($team.id)"
Write-Host "PAYPAL_PLAN_ID_PREMIUM=$($executive.id)"
Write-Host "`nCopy 5 dòng trên vào Vercel Environment Variables và Redeploy backend."
