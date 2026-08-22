---

# /fis:backend-development — C# + .NET 8 Best Practices

Reference guide cho DEV implement Story trên .NET 8 / ASP.NET Core. Activate tự động khi `/fis:plan` detect `tech_stack: csharp-dotnet` trong TRD. Covers async patterns, DI, EF Core, Minimal API, xUnit testing.

## When to use

- Implement Story với ASP.NET Core 8 backend (Windows host hoặc Linux container)
- Architecture decision: Clean Architecture, CQRS, EF Core strategy
- Code review: check async anti-patterns, DI lifetime, EF N+1
- Onboarding: new DEV cần hiểu FIS .NET conventions

## When NOT to use

- Java backend — dùng `/fis:backend-development`
- Frontend React — dùng `/fis:frontend-development`
- .NET Framework (legacy < .NET 6) — conventions khác, không áp dụng hoàn toàn

## Skill Activation Matrix

| TRD.tech_stack | Auto-activated with |
|---|---|
| `csharp-dotnet` | `/fis:plan`, `/fis:craft` |
| Manual | `/fis:backend-development` standalone |

## Project Structure (Clean Architecture)

```
src/
├── Fis.{Module}.Api/               # ASP.NET Core — endpoints, middleware, DI setup
│   ├── Endpoints/                  # Minimal API endpoint groups
│   ├── Middleware/                 # Error handling, logging, correlation
│   └── Program.cs                  # App builder + DI registration
├── Fis.{Module}.Application/       # CQRS handlers, services, interfaces
│   ├── Commands/                   # Write operations (IRequest<T>)
│   ├── Queries/                    # Read operations (IRequest<T>)
│   ├── Services/                   # Domain services
│   └── Contracts/                  # DTOs, interfaces
├── Fis.{Module}.Domain/            # Entities, value objects, domain events (POCO)
│   ├── Entities/
│   ├── ValueObjects/
│   └── Exceptions/
├── Fis.{Module}.Infrastructure/    # EF Core, external services, repos
│   ├── Persistence/                # DbContext, migrations, configurations
│   ├── Repositories/
│   └── ExternalServices/
└── Fis.{Module}.Tests/             # xUnit test project
    ├── Unit/
    ├── Integration/
    └── Fixtures/
```

**Naming**: PascalCase cho class/file theo C# convention. Namespace mirror folder structure.

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Class / struct | PascalCase | `UserService` |
| Interface | `I` prefix + PascalCase | `IUserRepository` |
| Method | PascalCase | `GetByIdAsync` |
| Async method | suffix `Async` | `CreateUserAsync` |
| Private field | `_camelCase` | `_userRepository` |
| Const / static readonly | PascalCase | `MaxRetryCount` |
| Local variable | camelCase | `userId` |
| File | PascalCase match class | `UserService.cs` |

## Async/Await — Critical Rules

```csharp
// ✅ Async all the way — Controller → Service → Repository
app.MapGet("/api/users/{id}", async (long id, IUserService svc, CancellationToken ct) =>
{
    var user = await svc.GetByIdAsync(id, ct);
    return user is null ? Results.NotFound() : Results.Ok(user);
});

// ✅ CancellationToken propagated
public async Task<UserDto?> GetByIdAsync(long id, CancellationToken ct = default)
{
    var user = await _db.Users
        .AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == id, ct);  // ct passed to EF
    return user is null ? null : _mapper.Map<UserDto>(user);
}

// ❌ NEVER .Result hoặc .Wait() — deadlock trong ASP.NET context
var user = _service.GetByIdAsync(id).Result;  // DEADLOCK
_service.CreateAsync(req).Wait();              // DEADLOCK

// ❌ async void — exception không catch được
public async void HandleEvent() { ... }  // KHÔNG dùng trừ event handler WinForms
// ✅ async Task thay thế
public async Task HandleEventAsync() { ... }

// ✅ ValueTask cho hot path (thường sync-complete)
public ValueTask<bool> ExistsInCacheAsync(string key)
{
    if (_cache.TryGetValue(key, out _)) return ValueTask.FromResult(true);
    return new ValueTask<bool>(CheckDatabaseAsync(key));
}
```

## Dependency Injection

```csharp
// Program.cs — DI registration
var builder = WebApplication.CreateBuilder(args);

// Lifetime rules:
// Transient  → per-injection (lightweight, stateless)
// Scoped     → per-request (DbContext, services mặc định)
// Singleton  → app lifetime (cache, config, typed clients)

builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();
builder.Services.AddHttpClient<IExternalPaymentClient, PaymentClient>();

// ✅ Constructor injection (primary pattern)
public class UserService(IUserRepository repo, ILogger<UserService> logger) : IUserService
{
    // C# 12 primary constructor — fields auto-generated
    public async Task<UserDto?> GetByIdAsync(long id, CancellationToken ct)
    {
        logger.LogInformation("Fetching user {UserId}", id);
        var user = await repo.GetByIdAsync(id, ct);
        return user is null ? null : new UserDto(user.Id, user.Name, user.Email);
    }
}

// ❌ Singleton service injecting Scoped service → captive dependency
// builder.Services.AddSingleton<IOrderService, OrderService>();
// (nếu OrderService depends on DbContext → exception at runtime)
```

## EF Core 8 Best Practices

```csharp
// DbContext — Scoped lifetime (default)
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}

// Entity configuration — IEntityTypeConfiguration<T>
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.HasKey(u => u.Id);
        b.Property(u => u.Name).HasMaxLength(100).IsRequired();
        b.Property(u => u.Email).HasMaxLength(200).IsRequired();
        b.HasIndex(u => u.Email).IsUnique();
        b.HasMany(u => u.Orders).WithOne(o => o.User).HasForeignKey(o => o.UserId);
    }
}

// Read-only query — AsNoTracking() + projection
public async Task<UserDto?> GetByIdAsync(long id, CancellationToken ct)
{
    return await _db.Users
        .AsNoTracking()                         // no change tracking overhead
        .Where(u => u.Id == id)
        .Select(u => new UserDto(u.Id, u.Name, u.Email))  // projection at DB
        .FirstOrDefaultAsync(ct);
}

// Eager loading — explicit Include (không lazy load)
public async Task<User?> GetWithOrdersAsync(long id, CancellationToken ct)
{
    return await _db.Users
        .Include(u => u.Orders)
        .ThenInclude(o => o.Items)
        .FirstOrDefaultAsync(u => u.Id == id, ct);
}
// ❌ Lazy loading (EF Core proxy) — N+1 ẩn, KHÔNG enable

// Migration workflow
// dotnet ef migrations add AddUserEmailIndex
// dotnet ef database update
// (CI: dotnet ef database update --connection $CI_DB_URL)

// Connection resilience
services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(conn, sql =>
        sql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(5), null)));
```

## ASP.NET Core — Minimal API (Preferred .NET 8)

```csharp
// Endpoint group — tách file, không nhét hết Program.cs
public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").RequireAuthorization();

        group.MapGet("{id:long}", GetUserAsync)
             .WithName("GetUser")
             .Produces<UserDto>()
             .Produces(404);

        group.MapPost("/", CreateUserAsync)
             .WithName("CreateUser")
             .Produces<UserDto>(201)
             .ProducesValidationProblem();

        return app;
    }

    private static async Task<IResult> GetUserAsync(
        long id, IUserService svc, CancellationToken ct)
    {
        var user = await svc.GetByIdAsync(id, ct);
        return user is null ? Results.NotFound() : Results.Ok(user);
    }

    private static async Task<IResult> CreateUserAsync(
        [FromBody] CreateUserRequest req,
        IUserService svc,
        CancellationToken ct)
    {
        var result = await svc.CreateAsync(req, ct);
        return Results.Created($"/api/users/{result.Id}", result);
    }
}

// Program.cs — clean registration
app.MapUserEndpoints();
```

## Validation — FluentValidation + ProblemDetails

```csharp
// Validator
public class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(200);
        RuleFor(x => x.InitialBalance).GreaterThanOrEqualTo(0);
    }
}

// Register
builder.Services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

// Global error middleware — RFC 7807 ProblemDetails
app.UseExceptionHandler(exApp => exApp.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    var problem = ex switch
    {
        NotFoundException nfe => new ProblemDetails
            { Status = 404, Title = "Not Found", Detail = nfe.Message },
        ValidationException ve => new ProblemDetails
            { Status = 400, Title = "Validation Failed",
              Extensions = { ["errors"] = ve.Errors } },
        _ => new ProblemDetails { Status = 500, Title = "Internal Server Error" }
    };
    ctx.Response.StatusCode = problem.Status ?? 500;
    await ctx.Response.WriteAsJsonAsync(problem);
}));
```

## Testing Strategy (TDD: Red → Green → Refactor)

```csharp
// 1. Unit test — Moq + FluentAssertions
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _repoMock = new();
    private readonly UserService _sut;

    public UserServiceTests() =>
        _sut = new UserService(_repoMock.Object, NullLogger<UserService>.Instance);

    [Fact]
    public async Task GetByIdAsync_ExistingUser_ReturnsDto()
    {
        var user = new User { Id = 1, Name = "Lan", Email = "lan@fis.com" };
        _repoMock.Setup(r => r.GetByIdAsync(1, default)).ReturnsAsync(user);

        var result = await _sut.GetByIdAsync(1);

        result.Should().NotBeNull();
        result!.Name.Should().Be("Lan");
    }

    [Fact]
    public async Task GetByIdAsync_MissingUser_ReturnsNull()
    {
        _repoMock.Setup(r => r.GetByIdAsync(99, default)).ReturnsAsync((User?)null);

        var result = await _sut.GetByIdAsync(99);

        result.Should().BeNull();
    }
}

// 2. Integration test — WebApplicationFactory + Testcontainers
public class UserApiIntegrationTests(FisWebAppFactory factory)
    : IClassFixture<FisWebAppFactory>
{
    [Fact]
    public async Task CreateUser_ValidRequest_Returns201()
    {
        var client = factory.CreateClient();
        var req = new { Name = "Lan", Email = "lan@fis.com", InitialBalance = 0m };

        var res = await client.PostAsJsonAsync("/api/users", req);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<UserDto>();
        body!.Name.Should().Be("Lan");
    }
}

public class FisWebAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db =
        new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

    public async Task InitializeAsync() => await _db.StartAsync();
    public new async Task DisposeAsync() => await _db.StopAsync();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Replace real DbContext with test container
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddDbContext<AppDbContext>(opt =>
                opt.UseNpgsql(_db.GetConnectionString()));
        });
    }
}
```

## Configuration

```csharp
// appsettings.json
{
  "Fis": {
    "Auth": { "JwtSecret": "", "TokenExpirySeconds": 3600 },
    "Database": { "ConnectionString": "" }
  }
}

// Typed config — IOptions<T> pattern
public record AuthOptions(string JwtSecret, int TokenExpirySeconds);

builder.Services.Configure<AuthOptions>(
    builder.Configuration.GetSection("Fis:Auth"));

// Inject
public class TokenService(IOptions<AuthOptions> opts) { ... }

// Secret management:
// Dev: dotnet user-secrets set "Fis:Auth:JwtSecret" "..."
// Prod: Azure Key Vault / AWS Secrets Manager / env var
// ❌ KHÔNG commit secret vào appsettings.json
```

## Logging + Observability

```csharp
// Serilog — structured logging
builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithCorrelationId()
    .WriteTo.Console(new JsonFormatter())
    .WriteTo.Seq(ctx.Configuration["Seq:ServerUrl"]!));

// Sử dụng trong service
public class UserService(ILogger<UserService> logger)
{
    public async Task<UserDto?> GetByIdAsync(long id, CancellationToken ct)
    {
        // ✅ Structured log với named property
        logger.LogInformation("Fetching user {UserId}", id);
        // ❌ String interpolation — mất structured property
        // logger.LogInformation($"Fetching user {id}");
    }
}

// Correlation ID middleware
app.UseCorrelationId();  // adds X-Correlation-ID header tracing

// Health checks
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>()
    .AddUrlGroup(new Uri("https://external.api/health"), "external-api");
app.MapHealthChecks("/health");
```

## Security

```csharp
// JWT Auth
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Fis:Auth:Issuer"],
            ValidAudience = config["Fis:Auth:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(config["Fis:Auth:JwtSecret"]!))
        };
    });

// Policy-based authorization
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("BranchManager", p => p.RequireRole("branch_manager", "admin"))
    .AddPolicy("AdminOnly", p => p.RequireRole("admin"));

// HTTPS enforce
app.UseHttpsRedirection();
app.UseHsts();  // prod only
```

## Performance Patterns

```csharp
// IAsyncEnumerable — streaming large datasets
public async IAsyncEnumerable<UserDto> StreamUsersAsync(
    [EnumeratorCancellation] CancellationToken ct)
{
    await foreach (var user in _db.Users.AsAsyncEnumerable().WithCancellation(ct))
        yield return new UserDto(user.Id, user.Name, user.Email);
}

// Output caching — deterministic endpoints
app.MapGet("/api/products", GetProductsAsync)
   .CacheOutput(p => p.Expire(TimeSpan.FromMinutes(5)).Tag("products"));

// StringBuilder trong vòng lặp
var sb = new StringBuilder();
foreach (var item in items) sb.Append(item.Name).Append(", ");
// ❌ string concat trong loop → O(n²) allocation
```

## Anti-patterns FIS

- `.Result` / `.Wait()` → deadlock risk — async all the way
- `async void` → unhandled exception silently swallowed
- Singleton DbContext → state corruption across requests
- EF lazy loading → hidden N+1 queries
- Try-catch nuốt exception (`catch (Exception) { }` trống) → silent failure
- `DateTime.Now` → timezone bug trên server — dùng `DateTimeOffset.UtcNow`
- Magic string config → `IOptions<T>` pattern
- Missing `CancellationToken` propagation → request cancel không dừng DB query

## Quality Standards (Story-level)

- Unit test coverage: ≥ 80% cho Application layer
- Integration test: phải cover happy path + validation + not-found
- `dotnet build --warningsAsErrors` pass — không warning được bỏ qua
- `dotnet test` pass trước commit
- Nullable reference types enabled (`<Nullable>enable</Nullable>` trong .csproj)

## Workflow Position

```
/fis:plan --story US-NNNN (detect csharp-dotnet) →
  auto-activate /fis:backend-development →
/fis:craft →
/fis:ship
```

## Reference

- .NET 8 docs: https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-8/
- ASP.NET Core Minimal API: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis
- EF Core 8: https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-8.0/
- FluentValidation: https://docs.fluentvalidation.net/
- Testcontainers .NET: https://dotnet.testcontainers.org/
